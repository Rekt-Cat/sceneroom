import { create } from "zustand";

/**
 * Requests to the 3D view that are not scene data: "zoom to these objects", and whether the camera is being
 * flown. A request has a number so asking for the same objects twice in a row still counts as a new request.
 */
type ViewState = {
  focusRequest: { ids: readonly string[]; seq: number } | null;
  /** Asks the 3D view to move the camera so these objects fill the view (double-click in the scene list, F). */
  requestFocus: (ids: readonly string[]) => void;
  /** True while the right mouse button is held in the 3D view: W A S D Q E fly the camera instead of their usual jobs. */
  flying: boolean;
  /** True if a fly key was used during the current right-button hold, so letting go must not open the right-click menu. */
  flewThisHold: boolean;
  setFlying: (flying: boolean) => void;
  markFlew: () => void;
};

export const useViewStore = create<ViewState>()((set) => ({
  focusRequest: null,
  requestFocus: (ids) =>
    set((state) => ({
      focusRequest: { ids, seq: (state.focusRequest?.seq ?? 0) + 1 },
    })),
  flying: false,
  flewThisHold: false,
  // A new hold starts without having flown
  setFlying: (flying) =>
    set(flying ? { flying, flewThisHold: false } : { flying }),
  markFlew: () => set({ flewThisHold: true }),
}));
