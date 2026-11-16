import { create } from "zustand";

/** What a click picks in edit mode: a point, an edge or a face. */
export type SelectMode = "point" | "edge" | "face";

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
  setAnchorEdge: (anchorEdge) => set({ anchorEdge }),
  enter: (nodeId) =>
    set({
      nodeId,
      selected: [],
      anchorEdge: null,
    }),
  exit: () =>
    set({
      nodeId: null,
      selected: [],
      anchorEdge: null,
    }),
  setSelected: (selected) => set({ selected }),
  // Points that were selected stay selected: they are the same selection seen as edges or faces
  setSelectMode: (selectMode) => set({ selectMode }),
}));
