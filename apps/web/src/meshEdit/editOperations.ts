import {
  DEFAULT_EXTRUDE_OPTIONS,
  DEFAULT_LOOP_CUT_OPTIONS,
  sameCreases,
  selectedEdges,
  selectedFaces,
  setCreases,
  buildTopology,
  edgeBetween,
  loopCut,
  bevelEdges,
  maxBevelWidth,
  edgeVertices,
  sanitizeLoopCutOptions,
  type LoopCutOptions,
  type Topology,
  deletePoints,
  sanitizeExtrudeOptions,
  type ExtrudeOptions,
  isEffectivelyLocked,
  expandToWelded,
  extrudeDistance,
  extrudeFaces,
  extrudeEdges,
  bridgeLoops,
  deleteFaces,
  fillHole,
  flipNormals,
  mergeAtCenter,
  weldClosePoints,
  weldGroups,
  type EditResult,
  type ShapeMesh,
} from "@sceneroom/shared";
import { loadMeshData } from "@/assets/meshStorage";
import {
  useEditStore,
  type BevelSession,
  type ExtrudeSession,
  type LoopCutSession,
} from "@/store/editStore";
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

/**
 * Deletes what is selected (Delete key). In Faces mode only the selected faces go, so the faces round them stay
 * whole; in Points and Edges mode every face that uses a selected point goes with it.
 */
export function deleteSelectedPoints(): Promise<boolean> {
  if (useEditStore.getState().selectMode === "face") {
    return run(deleteFaces, () => "Delete faces");
  }
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

/** The farthest an extrusion can go, out (positive) or in (negative). */
export const MAX_EXTRUDE_DISTANCE = 50;

/** How much smaller the new face of an inset starts (75 percent of the size), and how it starts. */
export const INSET_START_OPTIONS: ExtrudeOptions = {
  ...DEFAULT_EXTRUDE_OPTIONS,
  scale: 0.75,
};

/**
 * Extrudes the selected faces: copies them, pushes the copy out, and joins it with walls (Shift + E). A panel
 * then offers the settings (distance, divisions, scale, twist) until something else is done.
 */
export function extrudeSelectedFaces(): Promise<boolean> {
  return startExtrusion("extrude");
}

/**
 * Insets the selected faces: a smaller copy of them is made in the same place, joined to the old edge by a flat
 * ring of faces. The new face can then be pushed out or in (the Depth setting) or made bigger or smaller (the
 * Thickness setting). Select all the points of a face first (Faces mode: click it).
 */
export function insetSelectedFaces(): Promise<boolean> {
  return startExtrusion("inset");
}

/** Does the extrusion of a session (faces or edges) with these numbers. */
function extrudeWith(
  session: Pick<ExtrudeSession, "before" | "selectedBefore" | "edges">,
  distance: number,
  options: ExtrudeOptions,
): EditResult {
  if (session.edges) {
    const topology = buildTopology(session.before);
    return extrudeEdges(
      session.before,
      topology,
      selectedEdges(topology, session.selectedBefore),
      distance,
      options.divisions,
    );
  }
  return extrudeFaces(
    session.before,
    session.selectedBefore,
    distance,
    weldGroups(session.before.positions),
    options,
  );
}

async function startExtrusion(kind: ExtrudeSession["kind"]): Promise<boolean> {
  const edited = await editedMesh();
  if (!edited) return false;
  const groups = weldGroups(edited.mesh.positions);
  const all = expandToWelded(groups, edited.selected);
  // Extrude works on faces; with only edges selected it extrudes the edges
  const onlyEdges =
    kind === "extrude" &&
    selectedFaces(edited.mesh, all).length === 0 &&
    selectedEdges(buildTopology(edited.mesh), all).length > 0;
  const distance = kind === "inset" ? 0 : extrudeDistance(edited.mesh, all);
  const options =
    kind === "inset" ? INSET_START_OPTIONS : DEFAULT_EXTRUDE_OPTIONS;
  const result = extrudeWith(
    { before: edited.mesh, selectedBefore: all, edges: onlyEdges },
    distance,
    options,
  );
  if (!result.ok) {
    say(result.reason);
    return false;
  }
  const label = kind === "inset" ? "Inset" : "Extrude";
  if (!(await commitMesh(edited.nodeId, result.mesh, label))) return false;
  selectCap(result);
  useEditStore.getState().setExtrude({
    kind,
    edges: onlyEdges,
    before: edited.mesh,
    selectedBefore: all,
    distance,
    defaultDistance: distance,
    options,
    defaultOptions: options,
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
      Math.max(-MAX_EXTRUDE_DISTANCE, change.distance ?? session.distance),
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
  const result = extrudeWith(session, distance, options);
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
  const result = extrudeWith(session, session.distance, session.options);
  if (!result.ok) {
    say(result.reason);
    return false;
  }
  // Take the place of the extrusion made before: the same undo step, no new one
  const stored = await commitMesh(
    edit.nodeId,
    result.mesh,
    session.kind === "inset" ? "Inset" : "Extrude",
    true,
  );
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

// ---- Loop cut ----

/** Where the point numbers of an edge are, to find it again in a topology: the first point of each end. */
type EdgePoints = readonly [number, number];

/** The edge with these end points in the topology of a mesh, or -1. */
function findEdge(topology: Topology, edge: EdgePoints): number {
  const a = topology.vertexOf[edge[0]];
  const b = topology.vertexOf[edge[1]];
  return a === undefined || b === undefined ? -1 : edgeBetween(topology, a, b);
}

/**
 * Cuts the strip of squares across an edge: a new ring of edges goes through it (see `loopCut`). The new points
 * are selected. A panel then offers the number of cuts and a slide until something else is done. Returns false,
 * saying why in the bar over the 3D view, if the cut cannot be made.
 */
export async function startLoopCut(edge: EdgePoints): Promise<boolean> {
  const edited = await editedMesh();
  if (!edited) return false;
  const topology = buildTopology(edited.mesh);
  const found = findEdge(topology, edge);
  const result =
    found === -1
      ? ({ ok: false, reason: "That edge is no longer there." } as const)
      : loopCut(edited.mesh, topology, found, DEFAULT_LOOP_CUT_OPTIONS);
  if (!result.ok) {
    say(result.reason);
    return false;
  }
  if (!(await commitMesh(edited.nodeId, result.mesh, "Loop cut"))) return false;
  selectCap(result);
  const edit = useEditStore.getState();
  edit.setLoopCutMode(false);
  edit.setLoopCut({
    before: edited.mesh,
    edge,
    options: DEFAULT_LOOP_CUT_OPTIONS,
    pastLength: useSceneStore.getState().history.past.length,
  });
  edit.setExtrude(null);
  return true;
}

/** The result of the loop cut with its settings, or why not. */
function cutWith(session: LoopCutSession, options: LoopCutOptions) {
  const topology = buildTopology(session.before);
  const edge = findEdge(topology, session.edge);
  if (edge === -1) {
    return { ok: false, reason: "That edge is no longer there." } as const;
  }
  return loopCut(session.before, topology, edge, options);
}

/** Shows the loop cut with changed settings right away, without storing it (a slider being dragged). */
export function previewLoopCut(change: Partial<LoopCutOptions>): boolean {
  const edit = useEditStore.getState();
  const session = edit.loopCut;
  if (!session || !edit.nodeId) return false;
  if (useSceneStore.getState().history.past.length !== session.pastLength) {
    return false;
  }
  const options = sanitizeLoopCutOptions({ ...session.options, ...change });
  const result = cutWith(session, options);
  if (!result.ok) return false;
  showOnScreen(edit.nodeId, result.mesh);
  selectCap(result);
  edit.setLoopCut({ ...session, options });
  return true;
}

let cutCommitting = false;
let cutCommitAgain = false;

/** Stores the loop cut with the settings it has now, in place of the one made before (still ONE undo step). */
export async function commitLoopCut(): Promise<boolean> {
  if (cutCommitting) {
    cutCommitAgain = true;
    return false;
  }
  cutCommitting = true;
  try {
    let ok = true;
    do {
      cutCommitAgain = false;
      ok = await storeLoopCut();
    } while (cutCommitAgain);
    return ok;
  } finally {
    cutCommitting = false;
  }
}

async function storeLoopCut(): Promise<boolean> {
  const edit = useEditStore.getState();
  const session = edit.loopCut;
  if (!session || !edit.nodeId) return false;
  if (useSceneStore.getState().history.past.length !== session.pastLength) {
    restoreOriginal(edit.nodeId);
    edit.setLoopCut(null);
    say(
      "The cut's settings can only be changed right after cutting. Undo, or cut again.",
    );
    return false;
  }
  const result = cutWith(session, session.options);
  if (!result.ok) {
    say(result.reason);
    return false;
  }
  if (!(await commitMesh(edit.nodeId, result.mesh, "Loop cut", true))) {
    restoreOriginal(edit.nodeId);
    return false;
  }
  selectCap(result);
  live.original = null;
  return true;
}

/** Changes the settings of the last loop cut and stores the result at once (for typed values and resets). */
export async function changeLoopCut(
  change: Partial<LoopCutOptions>,
): Promise<boolean> {
  const edit = useEditStore.getState();
  if (!edit.loopCut) return false;
  if (
    useSceneStore.getState().history.past.length !== edit.loopCut.pastLength
  ) {
    return commitLoopCut();
  }
  if (!previewLoopCut(change)) return false;
  return commitLoopCut();
}

// ---- Edge creases ----

/** The crease values the buttons set: fully sharp, and a softer one that rounds off after the first level of smoothing. */
export const CREASE_SHARP = 1;
export const CREASE_SOFT = 0.5;

/**
 * Marks the selected edges as creased (`value` 0 to 1; 0 clears), so the Smooth modifier keeps them crisp. An edge
 * is selected when both its ends are (click an edge, Alt-click a loop, or select a face for all its sides).
 * One undo step. Says why in the bar over the 3D view if no edge is selected.
 */
export async function creaseSelectedEdges(value: number): Promise<boolean> {
  const edited = await editedMesh();
  if (!edited) return false;
  const topology = buildTopology(edited.mesh);
  const edges = selectedEdges(topology, edited.selected);
  if (edges.length === 0) {
    say(
      "Select an edge first: press 2 for edge mode, then click an edge (Alt-click selects a whole loop).",
    );
    return false;
  }
  const creases = setCreases(edited.mesh, topology, edges, value);
  if (sameCreases(creases, edited.mesh.creases)) return true; // nothing changes
  const label =
    value <= 0 ? "Clear crease" : value >= 1 ? "Crease edges" : "Soften crease";
  return commitMesh(
    edited.nodeId,
    { ...edited.mesh, creases: creases.length > 0 ? creases : undefined },
    label,
  );
}

// ---- Bevel ----

/** The bevel width the first try uses, as a fraction of the widest safe width. */
export const BEVEL_START_FRACTION = 0.25;
export const BEVEL_MAX_SEGMENTS = 8;

/** The result of the bevel with its settings, or why not. */
function bevelWith(session: BevelSession, width: number, segments: number) {
  const topology = buildTopology(session.before);
  const edges = session.edges.map((edge) => findEdge(topology, edge));
  if (edges.includes(-1)) {
    return { ok: false, reason: "Those edges are no longer there." } as const;
  }
  return bevelEdges(session.before, topology, edges, width, segments);
}

/**
 * Bevels the selected edges: each is replaced by a narrow strip so the corner catches the light. A panel then
 * offers the width and the number of segments (more is rounder) until something else is done. Says why in the
 * bar over the 3D view if it cannot be done.
 */
export async function bevelSelectedEdges(): Promise<boolean> {
  const edited = await editedMesh();
  if (!edited) return false;
  const topology = buildTopology(edited.mesh);
  const edges = selectedEdges(topology, edited.selected);
  if (edges.length === 0) {
    say(
      "Select an edge first: press 2 for edge mode, then click an edge (Alt-click selects a whole loop).",
    );
    return false;
  }
  const maxWidth = maxBevelWidth(edited.mesh, topology, edges);
  const width = maxWidth * BEVEL_START_FRACTION;
  const result = bevelEdges(edited.mesh, topology, edges, width, 1);
  if (!result.ok) {
    say(result.reason);
    return false;
  }
  if (!(await commitMesh(edited.nodeId, result.mesh, "Bevel"))) return false;
  selectCap(result);
  const edit = useEditStore.getState();
  edit.setExtrude(null);
  edit.setLoopCut(null);
  edit.setBevel({
    before: edited.mesh,
    edges: edges.map((e) => {
      const [a, b] = edgeVertices(topology, e);
      return [
        topology.vertexPoints[a]![0]!,
        topology.vertexPoints[b]![0]!,
      ] as const;
    }),
    width: result.width,
    defaultWidth: result.width,
    maxWidth,
    segments: 1,
    pastLength: useSceneStore.getState().history.past.length,
  });
  return true;
}

export type BevelChange = { width?: number; segments?: number };

function bevelParams(session: BevelSession, change: BevelChange) {
  return {
    width: Math.min(
      session.maxWidth,
      Math.max(session.maxWidth * 0.01, change.width ?? session.width),
    ),
    segments: Math.min(
      BEVEL_MAX_SEGMENTS,
      Math.max(1, Math.round(change.segments ?? session.segments)),
    ),
  };
}

/** Shows the bevel with changed settings right away, without storing it (a slider being dragged). */
export function previewBevel(change: BevelChange): boolean {
  const edit = useEditStore.getState();
  const session = edit.bevel;
  if (!session || !edit.nodeId) return false;
  if (useSceneStore.getState().history.past.length !== session.pastLength) {
    return false;
  }
  const { width, segments } = bevelParams(session, change);
  const result = bevelWith(session, width, segments);
  if (!result.ok) return false;
  showOnScreen(edit.nodeId, result.mesh);
  selectCap(result);
  edit.setBevel({ ...session, width, segments });
  return true;
}

let bevelCommitting = false;
let bevelCommitAgain = false;

/** Stores the bevel with the settings it has now, in place of the one made before (still ONE undo step). */
export async function commitBevel(): Promise<boolean> {
  if (bevelCommitting) {
    bevelCommitAgain = true;
    return false;
  }
  bevelCommitting = true;
  try {
    let ok = true;
    do {
      bevelCommitAgain = false;
      ok = await storeBevel();
    } while (bevelCommitAgain);
    return ok;
  } finally {
    bevelCommitting = false;
  }
}

async function storeBevel(): Promise<boolean> {
  const edit = useEditStore.getState();
  const session = edit.bevel;
  if (!session || !edit.nodeId) return false;
  if (useSceneStore.getState().history.past.length !== session.pastLength) {
    restoreOriginal(edit.nodeId);
    edit.setBevel(null);
    say(
      "The bevel's settings can only be changed right after bevelling. Undo, or bevel again.",
    );
    return false;
  }
  const result = bevelWith(session, session.width, session.segments);
  if (!result.ok) {
    say(result.reason);
    return false;
  }
  if (!(await commitMesh(edit.nodeId, result.mesh, "Bevel", true))) {
    restoreOriginal(edit.nodeId);
    return false;
  }
  selectCap(result);
  live.original = null;
  return true;
}

/** Changes the settings of the last bevel and stores the result at once (for typed values and resets). */
export async function changeBevel(change: BevelChange): Promise<boolean> {
  const edit = useEditStore.getState();
  if (!edit.bevel) return false;
  if (useSceneStore.getState().history.past.length !== edit.bevel.pastLength) {
    return commitBevel();
  }
  if (!previewBevel(change)) return false;
  return commitBevel();
}

// ---- Fixing up a mesh: merge, weld, flip, fill, bridge ----

/** Weld joins selected points closer than this share of the mesh's biggest side (a tenth of a percent). */
export const WELD_FRACTION = 0.001;

/** The length of the longest side of the box round the mesh. */
function meshSize(mesh: ShapeMesh): number {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.positions[i * 3 + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  return Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
}

/** Merge: the selected points become one point in the middle of them. */
export function mergeSelectedPoints(): Promise<boolean> {
  return run(mergeAtCenter, () => "Merge points");
}

/** Weld: selected points that are almost on top of each other become one. */
export function weldSelectedPoints(): Promise<boolean> {
  return run(
    (mesh, selected) =>
      weldClosePoints(mesh, selected, meshSize(mesh) * WELD_FRACTION),
    () => "Weld points",
  );
}

/** Flip: turns the selected faces (or, with nothing selected, the whole mesh) inside out. */
export function flipSelectedNormals(): Promise<boolean> {
  return run(flipNormals, (count) =>
    count === 0 ? "Flip all faces" : "Flip faces",
  );
}

/** Fill: closes the hole that has a selected edge on its border. */
export function fillSelectedHole(): Promise<boolean> {
  return run(fillHole, () => "Fill hole");
}

/** Bridge: joins two selected open rims with a strip of faces. */
export function bridgeSelectedLoops(): Promise<boolean> {
  return run(bridgeLoops, () => "Bridge");
}
