import { create } from "zustand";
import type {
  ExtrudeOptions,
  LoopCutOptions,
  ShapeMesh,
} from "@sceneroom/shared";

/** What a click picks in edit mode: a point, an edge or a face. */
export type SelectMode = "point" | "edge" | "face";

/**
 * The last Extrude, kept so its settings can be changed afterwards (the panel that appears after Extrude).
 * `before` is the mesh as it was before the extrusion and `selectedBefore` the points that were extruded; a
 * change of settings does the extrusion again from those. It ends when anything else is done (`pastLength` is how
 * long the undo history was just after the extrusion).
 */
export type ExtrudeSession = {
  /** "extrude" pushes the faces out; "inset" starts as a smaller copy of them in the same place. Same operation, different starting values and words. */
  kind: "extrude" | "inset";
  /** True when edges were extruded (not faces): only the distance and divisions apply. */
  edges?: boolean;
  before: ShapeMesh;
  selectedBefore: readonly number[];
  /** How far the extrusion goes, and the distance it started with (for its reset button). */
  distance: number;
  defaultDistance: number;
  options: ExtrudeOptions;
  /** The options it started with (for the reset buttons). */
  defaultOptions: ExtrudeOptions;
  pastLength: number;
};

/**
 * The last loop cut, kept so its settings can be changed afterwards (the panel that appears after a cut), like
 * `ExtrudeSession`. `edge` is the edge that was pointed at, as the first point of each of its ends in `before`.
 */
export type LoopCutSession = {
  before: ShapeMesh;
  edge: readonly [number, number];
  options: LoopCutOptions;
  pastLength: number;
};

/**
 * The last bevel, kept so its width and segments can be changed afterwards (like `LoopCutSession`). `edges` are
 * the bevelled edges as the first point of each of their ends in `before`.
 */
export type BevelSession = {
  before: ShapeMesh;
  edges: readonly (readonly [number, number])[];
  width: number;
  defaultWidth: number;
  /** The widest bevel that is safe for these edges. */
  maxWidth: number;
  segments: number;
  pastLength: number;
};

/**
 * The Divide whose number of cuts is being chosen. Pressing Divide only opens it (nothing is cut); the slider
 * makes the cuts. `selectedBefore` are the points that were selected before (none means the whole mesh).
 */
export type DivideSession = {
  before: ShapeMesh;
  selectedBefore: readonly number[];
  /** 0 changes nothing: Divide only opens the panel, the slider does the cutting. */
  cuts: number;
  /** False until the slider has moved off 0 and the mesh was stored (the first store is a new undo step). */
  applied: boolean;
  pastLength: number;
};

/**
 * Edit mode: working on the individual points of one editable mesh. While it is on, `nodeId` is the
 * mesh being edited and `selected` are the numbers of its selected points. Edges and faces are selected
 * through their points (selecting both ends of an edge selects the edge), so every tool works on points.
 * This is screen state, not scene data: it is not saved and not part of undo (the edits themselves are).
 */
type EditState = {
  nodeId: string | null;
  selected: readonly number[];
  /**
   * The edge that was clicked last, as the first point of each of its two ends. The Loop and Ring buttons
   * work from it, so each shows the loop or ring of that edge. Null when no edge was clicked.
   */
  anchorEdge: readonly [number, number] | null;
  /** True while the Loop cut tool is on: hovering shows where a cut would go, a click cuts. */
  loopCutMode: boolean;
  setLoopCutMode: (on: boolean) => void;
  /** The loop cut whose settings can still be changed, or null. */
  loopCut: LoopCutSession | null;
  setLoopCut: (session: LoopCutSession | null) => void;
  /** True while the UV window (the flat map of the mesh being edited) is shown. */
  uvWindow: boolean;
  setUvWindow: (on: boolean) => void;
  /** What the UV window colours by: each piece in its own colour, or how stretched each face is. */
  uvWindowMode: "pieces" | "stretch";
  setUvWindowMode: (mode: "pieces" | "stretch") => void;
  /** The divide whose number of cuts can still be changed, or null. */
  divide: DivideSession | null;
  setDivide: (session: DivideSession | null) => void;
  /** The bevel whose settings can still be changed, or null. */
  bevel: BevelSession | null;
  setBevel: (session: BevelSession | null) => void;
  /** The extrusion whose settings can still be changed, or null. */
  extrude: ExtrudeSession | null;
  setExtrude: (session: ExtrudeSession | null) => void;
  setAnchorEdge: (anchor: readonly [number, number] | null) => void;
  /**
   * X-ray: draw the lines and points of ALL faces, also those the camera cannot see (and let them be picked).
   * Off (the start): only what is on faces facing the camera.
   */
  xray: boolean;
  setXray: (xray: boolean) => void;
  /** What a click picks (keys 1, 2, 3). Kept between edit sessions. */
  selectMode: SelectMode;
  /** Starts editing this object's points. The caller has checked that it is an editable mesh. */
  enter: (nodeId: string) => void;
  /** Leaves edit mode. */
  exit: () => void;
  setSelected: (selected: readonly number[]) => void;
  setSelectMode: (mode: SelectMode) => void;
};

export const useEditStore = create<EditState>()((set) => ({
  nodeId: null,
  selected: [],
  selectMode: "point",
  anchorEdge: null,
  xray: false,
  setXray: (xray) => set({ xray }),
  extrude: null,
  setExtrude: (extrude) => set({ extrude }),
  loopCutMode: false,
  setLoopCutMode: (loopCutMode) => set({ loopCutMode }),
  uvWindow: false,
  setUvWindow: (uvWindow) => set({ uvWindow }),
  uvWindowMode: "pieces",
  setUvWindowMode: (uvWindowMode) => set({ uvWindowMode }),
  divide: null,
  setDivide: (divide) => set({ divide }),
  bevel: null,
  setBevel: (bevel) => set({ bevel }),
  loopCut: null,
  setLoopCut: (loopCut) => set({ loopCut }),
  setAnchorEdge: (anchorEdge) => set({ anchorEdge }),
  enter: (nodeId) =>
    set({
      nodeId,
      selected: [],
      anchorEdge: null,
      extrude: null,
      loopCut: null,
      bevel: null,
      divide: null,
      loopCutMode: false,
    }),
  exit: () =>
    set({
      nodeId: null,
      selected: [],
      anchorEdge: null,
      extrude: null,
      loopCut: null,
      bevel: null,
      divide: null,
      loopCutMode: false,
    }),
  setSelected: (selected) => set({ selected }),
  // Points that were selected stay selected: they are the same selection seen as edges or faces
  setSelectMode: (selectMode) => set({ selectMode }),
}));

/**
 * The settings session whose panel is shown under the edit bar (loop cut, bevel, divide or extrude), or null.
 * Every operation with a panel must be listed here, or its panel never appears.
 */
export function activeOperation(
  state: Pick<EditState, "loopCut" | "bevel" | "divide" | "extrude">,
): { pastLength: number } | null {
  return state.loopCut ?? state.bevel ?? state.divide ?? state.extrude;
}
