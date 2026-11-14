import { create } from "zustand";

/**
 * Edit mode: working on the individual points of one editable mesh. While it is on, `nodeId` is the
 * mesh being edited and `selected` are the numbers of its selected points. This is screen state, not scene
 * data: it is not saved and not part of undo (the edits themselves are).
 */
type EditState = {
  nodeId: string | null;
  selected: readonly number[];
  /** Starts editing this object's points. The caller has checked that it is an editable mesh. */
  enter: (nodeId: string) => void;
  /** Leaves edit mode. */
  exit: () => void;
  setSelected: (selected: readonly number[]) => void;
};

export const useEditStore = create<EditState>()((set) => ({
  nodeId: null,
  selected: [],
  enter: (nodeId) => set({ nodeId, selected: [] }),
  exit: () => set({ nodeId: null, selected: [] }),
  setSelected: (selected) => set({ selected }),
}));
