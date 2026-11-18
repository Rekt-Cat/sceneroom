import { create } from "zustand";
import {
  DEFAULT_PEEK_TILES,
  parsePeekTiles,
  type ViewKind,
} from "@sceneroom/shared";

/** Where the four tile choices are remembered between visits (in this browser only). */
const PEEK_TILES_KEY = "sceneroom.peekTiles.v1";

function savePeekTiles(tiles: readonly ViewKind[]): void {
  try {
    window.localStorage.setItem(PEEK_TILES_KEY, JSON.stringify(tiles));
  } catch (error) {
    // Storage can be blocked (private window) or full; the choices still work, they are just not remembered
    console.warn("Could not save the four-view choices:", error);
  }
}

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
  /** Reads the saved tile choices from the browser. Called once, after the first render. */
  hydratePeekTiles: () => void;
  /** The tile the pointer is over, or -1. */
  peekHover: number;
  setPeekHover: (tile: number) => void;
  /**
   * The objects that show the UV checker: a checkerboard instead of their colour, to see how the flat texture map
   * lies on them (equal, square cells mean a good map). Screen state, not saved. Each object has its own switch.
   */
  checkerIds: ReadonlySet<string>;
  setChecker: (nodeId: string, on: boolean) => void;
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
    set((state) => {
      if (tile < 0 || tile > 3) return state;
      const peekTiles = state.peekTiles.map((v, i) => (i === tile ? view : v));
      savePeekTiles(peekTiles);
      return { peekTiles };
    }),
  hydratePeekTiles: () => {
    try {
      const saved = parsePeekTiles(window.localStorage.getItem(PEEK_TILES_KEY));
      if (saved) set({ peekTiles: saved });
    } catch (error) {
      console.warn("Could not read the saved four-view choices:", error);
    }
  },
  peekHover: -1,
  setPeekHover: (peekHover) => set({ peekHover }),
  checkerIds: new Set<string>(),
  setChecker: (nodeId, on) =>
    set((state) => {
      if (state.checkerIds.has(nodeId) === on) return state;
      const checkerIds = new Set(state.checkerIds);
      if (on) checkerIds.add(nodeId);
      else checkerIds.delete(nodeId);
      return { checkerIds };
    }),
  bigView: "perspective",
  setBigView: (bigView) => set({ bigView }),
}));
