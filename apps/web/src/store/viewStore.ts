import { create } from "zustand";
import { DEFAULT_PEEK_TILES, type ViewKind } from "@sceneroom/shared";

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
  /** True while the four views are shown (Space held for a moment with an object selected). */
  peekActive: boolean;
  setPeekActive: (active: boolean) => void;
  /** What each of the four tiles shows: top left, top right, bottom left, bottom right. */
  peekTiles: readonly ViewKind[];
  /** Changes what one tile shows (from its drop-down). */
  setPeekTile: (tile: number, view: ViewKind) => void;
  /** The tile the pointer is over, or -1. */
  peekHover: number;
  setPeekHover: (tile: number) => void;
  /** What the big view shows: the normal 3D view, or a pinned flat side view. */
  bigView: ViewKind;
  setBigView: (view: ViewKind) => void;
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
  peekActive: false,
  setPeekActive: (peekActive) =>
    set(peekActive ? { peekActive } : { peekActive, peekHover: -1 }),
  peekTiles: DEFAULT_PEEK_TILES,
  setPeekTile: (tile, view) =>
    set((state) =>
      tile < 0 || tile > 3
        ? state
        : { peekTiles: state.peekTiles.map((v, i) => (i === tile ? view : v)) },
    ),
  peekHover: -1,
  setPeekHover: (peekHover) => set({ peekHover }),
  bigView: "perspective",
  setBigView: (bigView) => set({ bigView }),
}));
