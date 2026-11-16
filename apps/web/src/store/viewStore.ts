import { create } from "zustand";

/**
 * Requests to the 3D view that are not scene data: "zoom to these objects". A request has a number so
 * asking for the same objects twice in a row still counts as a new request.
 */
type ViewState = {
  focusRequest: { ids: readonly string[]; seq: number } | null;
  /** Asks the 3D view to move the camera so these objects fill the view (double-click in the scene list, F). */
  requestFocus: (ids: readonly string[]) => void;
};

export const useViewStore = create<ViewState>()((set) => ({
  focusRequest: null,
  requestFocus: (ids) =>
    set((state) => ({
      focusRequest: { ids, seq: (state.focusRequest?.seq ?? 0) + 1 },
    })),
}));
