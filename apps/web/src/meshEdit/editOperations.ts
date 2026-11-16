import {
  DEFAULT_EXTRUDE_OPTIONS,
  deletePoints,
  sanitizeExtrudeOptions,
  type ExtrudeOptions,
  isEffectivelyLocked,
  expandToWelded,
  extrudeDistance,
  extrudeFaces,
  weldGroups,
  type EditResult,
  type ShapeMesh,
} from "@sceneroom/shared";
import { loadMeshData } from "@/assets/meshStorage";
import { useEditStore, type ExtrudeSession } from "@/store/editStore";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { buildMeshGeometry } from "@/components/viewport/shapeGeometry";
import { getMesh } from "@/components/viewport/meshRegistry";
import { commitMesh } from "./commitMeshEdit";
import type { BufferGeometry, Mesh } from "three";

function say(text: string) {
  useImportStore.getState().setMessage({ tone: "error", text });
}

/** The mesh being edited, and the points that are selected on it. Null if edit mode is off. */
async function editedMesh(): Promise<{
  nodeId: string;
  mesh: ShapeMesh;
  selected: readonly number[];
} | null> {
  const { nodeId, selected } = useEditStore.getState();
  const { scene } = useSceneStore.getState();
  const node = nodeId ? scene.nodes[nodeId] : undefined;
  if (!nodeId || !node?.assetId || node.kind !== "mesh") return null;
  // The object may have been locked while it was being edited
  if (isEffectivelyLocked(scene, nodeId)) {
    say(`"${node.name}" is locked. Unlock it to change its points.`);
    return null;
  }
  try {
    return { nodeId, mesh: await loadMeshData(node.assetId), selected };
  } catch (error) {
    console.error("Reading the mesh failed:", error);
    say("Could not read the mesh. Please try again.");
    return null;
  }
}

/** Runs an operation on the edited mesh, stores the result as one undo step and selects what it says. */
async function run(
  operation: (mesh: ShapeMesh, selected: readonly number[]) => EditResult,
  label: (selectedCount: number) => string,
): Promise<boolean> {
  const edited = await editedMesh();
  if (!edited) return false;
  const result = operation(edited.mesh, edited.selected);
  if (!result.ok) {
    say(result.reason);
    return false;
  }
  if (
    !(await commitMesh(
      edited.nodeId,
      result.mesh,
      label(edited.selected.length),
    ))
  ) {
    return false;
  }
  // The points were numbered again: only now is the new selection right. Points on the same spot move
  // together (an extrusion's cap and the tops of its walls are separate points on one spot), or dragging the
  // new face would leave its walls behind and tear the surface.
  const groups = weldGroups(result.mesh.positions);
  useEditStore.getState().setSelected(expandToWelded(groups, result.selected));
  return true;
}

/** Deletes the selected points and the triangles that use them (Delete key). */
export function deleteSelectedPoints(): Promise<boolean> {
  return run(
    (mesh, selected) => {
      // Points on the same spot go together, or a stray point would be left behind
      const groups = weldGroups(mesh.positions);
      return deletePoints(mesh, expandToWelded(groups, selected));
    },
    (count) => (count === 1 ? "Delete point" : `Delete ${count} points`),
  );
}

/** How the extrusion settings are changed: any of them. */
export type ExtrudeChange = Partial<ExtrudeOptions> & { distance?: number };

/** The farthest an extrusion can go (and the nearest: it cannot be zero, the walls would have no size). */
export const MIN_EXTRUDE_DISTANCE = 0.01;
export const MAX_EXTRUDE_DISTANCE = 50;

/**
 * Extrudes the selected faces: copies them, pushes the copy out, and joins it with walls (Shift + E). A panel
 * then offers the settings (distance, divisions, scale, twist) until something else is done.
 */
export async function extrudeSelectedFaces(): Promise<boolean> {
  const edited = await editedMesh();
  if (!edited) return false;
  const groups = weldGroups(edited.mesh.positions);
  const all = expandToWelded(groups, edited.selected);
  const distance = extrudeDistance(edited.mesh, all);
  const result = extrudeFaces(edited.mesh, all, distance, groups);
  if (!result.ok) {
    say(result.reason);
    return false;
  }
  if (!(await commitMesh(edited.nodeId, result.mesh, "Extrude"))) return false;
  selectCap(result);
  useEditStore.getState().setExtrude({
    before: edited.mesh,
    selectedBefore: all,
    distance,
    defaultDistance: distance,
    options: DEFAULT_EXTRUDE_OPTIONS,
    pastLength: useSceneStore.getState().history.past.length,
  });
  return true;
}

/** Selects the new cap (and every point on the same spot: the tops of the walls), so dragging it takes the walls along. */
function selectCap(result: { mesh: ShapeMesh; selected: number[] }) {
  const groups = weldGroups(result.mesh.positions);
  useEditStore.getState().setSelected(expandToWelded(groups, result.selected));
}

/**
 * While a setting is being dragged the extrusion is only SHOWN: the new geometry is put on the object on the
 * screen, with nothing stored and no undo step, so dragging is smooth. `original` is the geometry the object
 * had when the dragging began (put back if the change cannot be stored).
 */
const live: { original: BufferGeometry | null } = { original: null };

/** Puts a mesh on the object on the screen without storing it (there is nothing to show where the object is not drawn). */
function showOnScreen(nodeId: string, mesh: ShapeMesh) {
  const object = getMesh(nodeId) as Mesh | undefined;
  if (!object) return;
  live.original ??= object.geometry;
  const previous = object.geometry;
  object.geometry = buildMeshGeometry(mesh, []);
  // Only the geometries made here are freed; the original belongs to the scene
  if (previous !== live.original) previous.dispose();
}

/** The numbers an extrusion would use with this change applied to the session. */
function paramsFor(session: ExtrudeSession, change: ExtrudeChange) {
  return {
    options: sanitizeExtrudeOptions({ ...session.options, ...change }),
    distance: Math.min(
      MAX_EXTRUDE_DISTANCE,
      Math.max(MIN_EXTRUDE_DISTANCE, change.distance ?? session.distance),
    ),
  };
}

/**
 * Shows the extrusion with changed settings right away, without storing it: the geometry on the screen is
 * replaced and the settings are remembered, so a slider can be dragged smoothly. Call `commitExtrude` when the
 * dragging stops. Returns false if nothing could be shown.
 */
export function previewExtrude(change: ExtrudeChange): boolean {
  const edit = useEditStore.getState();
  const session = edit.extrude;
  if (!session || !edit.nodeId) return false;
  if (useSceneStore.getState().history.past.length !== session.pastLength) {
    return false;
  }
  const { options, distance } = paramsFor(session, change);
  const result = extrudeFaces(
    session.before,
    session.selectedBefore,
    distance,
    weldGroups(session.before.positions),
    options,
  );
  if (!result.ok) return false;

  showOnScreen(edit.nodeId, result.mesh);

  selectCap(result);
  edit.setExtrude({ ...session, distance, options });
  return true;
}

let committing = false;
let commitAgain = false;

/**
 * Stores the extrusion with the settings it has now, in place of the one made before (still ONE undo step).
 * Called when a setting stops changing. Does nothing if there is nothing to store. If something else was done
 * since the extrusion, says so and ends the settings.
 */
export async function commitExtrude(): Promise<boolean> {
  if (committing) {
    commitAgain = true;
    return false;
  }
  committing = true;
  try {
    let ok = true;
    do {
      commitAgain = false;
      ok = await storeExtrusion();
    } while (commitAgain);
    return ok;
  } finally {
    committing = false;
  }
}

async function storeExtrusion(): Promise<boolean> {
  const edit = useEditStore.getState();
  const session = edit.extrude;
  const scene = useSceneStore.getState();
  if (!session || !edit.nodeId) return false;
  if (scene.history.past.length !== session.pastLength) {
    // Something else was done after the extrusion, so its settings can no longer be changed
    restoreOriginal(edit.nodeId);
    edit.setExtrude(null);
    say(
      "The extrusion's settings can only be changed right after extruding. Undo, or extrude again.",
    );
    return false;
  }
  const result = extrudeFaces(
    session.before,
    session.selectedBefore,
    session.distance,
    weldGroups(session.before.positions),
    session.options,
  );
  if (!result.ok) {
    say(result.reason);
    return false;
  }
  // Take the place of the extrusion made before: the same undo step, no new one
  const stored = await commitMesh(edit.nodeId, result.mesh, "Extrude", true);
  if (!stored) {
    restoreOriginal(edit.nodeId);
    return false;
  }
  selectCap(result);
  live.original = null;
  return true;
}

/** Puts back the geometry the object had before the settings were being dragged. */
function restoreOriginal(nodeId: string) {
  const object = getMesh(nodeId) as Mesh | undefined;
  if (object && live.original) object.geometry = live.original;
  live.original = null;
}

/** Changes the settings of the last extrusion and stores the result at once (for typed values and resets). */
export async function changeExtrude(change: ExtrudeChange): Promise<boolean> {
  const edit = useEditStore.getState();
  if (!edit.extrude) return false;
  // Something done since the extrusion: say so through the commit
  if (
    useSceneStore.getState().history.past.length !== edit.extrude.pastLength
  ) {
    return commitExtrude();
  }
  if (!previewExtrude(change)) return false;
  return commitExtrude();
}
