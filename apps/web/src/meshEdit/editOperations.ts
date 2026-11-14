import {
  deletePoints,
  isEffectivelyLocked,
  expandToWelded,
  extrudeDistance,
  extrudeFaces,
  weldGroups,
  type EditResult,
  type ShapeMesh,
} from "@sceneroom/shared";
import { loadMeshData } from "@/assets/meshStorage";
import { useEditStore } from "@/store/editStore";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { commitMesh } from "./commitMeshEdit";

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
  // The points were numbered again: only now is the new selection right
  useEditStore.getState().setSelected(result.selected);
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

/** Extrudes the selected faces: copies them, pushes the copy out, and joins it with walls (Shift + E). */
export function extrudeSelectedFaces(): Promise<boolean> {
  return run(
    (mesh, selected) => {
      const groups = weldGroups(mesh.positions);
      const all = expandToWelded(groups, selected);
      return extrudeFaces(mesh, all, extrudeDistance(mesh, all), groups);
    },
    () => "Extrude",
  );
}
