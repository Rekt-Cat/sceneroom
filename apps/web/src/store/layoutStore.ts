import { create } from "zustand";
import {
  LEFT_PANEL_LIMITS,
  RIGHT_PANEL_LIMITS,
  clampPanelWidth,
  maxPanelWidth,
  parseSavedLayout,
} from "@sceneroom/shared";

/** Where the panel widths are remembered between visits (in this browser only). */
const STORAGE_KEY = "sceneroom.layout.v1";

/** Window width to use when there is no window (during the server render). */
const FALLBACK_WINDOW_WIDTH = 1440;

type LayoutState = {
  leftWidth: number;
  rightWidth: number;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  /** Goes back to the starting width of a panel. */
  resetLeftWidth: () => void;
  resetRightWidth: () => void;
  /** Reads saved widths from the browser. Called once, after the first render. */
  hydrate: () => void;
};

const windowWidth = () =>
  typeof window === "undefined" ? FALLBACK_WINDOW_WIDTH : window.innerWidth;

function save(leftWidth: number, rightWidth: number): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ leftWidth, rightWidth }),
    );
  } catch (error) {
    // Storage can be blocked (private window) or full. The layout still works, it is just not remembered.
    console.warn("Could not save the panel widths:", error);
  }
}

export const useLayoutStore = create<LayoutState>()((set, get) => {
  const setWidths = (leftWidth: number, rightWidth: number) => {
    set({ leftWidth, rightWidth });
    save(leftWidth, rightWidth);
  };

  return {
    leftWidth: LEFT_PANEL_LIMITS.default,
    rightWidth: RIGHT_PANEL_LIMITS.default,
    setLeftWidth: (width) => {
      const { rightWidth } = get();
      const max = maxPanelWidth(LEFT_PANEL_LIMITS, rightWidth, windowWidth());
      setWidths(clampPanelWidth(width, LEFT_PANEL_LIMITS, max), rightWidth);
    },
    setRightWidth: (width) => {
      const { leftWidth } = get();
      const max = maxPanelWidth(RIGHT_PANEL_LIMITS, leftWidth, windowWidth());
      setWidths(leftWidth, clampPanelWidth(width, RIGHT_PANEL_LIMITS, max));
    },
    resetLeftWidth: () => get().setLeftWidth(LEFT_PANEL_LIMITS.default),
    resetRightWidth: () => get().setRightWidth(RIGHT_PANEL_LIMITS.default),
    hydrate: () => {
      let text: string | null = null;
      try {
        text = window.localStorage.getItem(STORAGE_KEY);
      } catch (error) {
        console.warn("Could not read the saved panel widths:", error);
      }
      const saved = parseSavedLayout(text);
      if (!saved) return;
      // Clamp what was saved: the window may be smaller than last time
      const left = clampPanelWidth(
        saved.leftWidth,
        LEFT_PANEL_LIMITS,
        maxPanelWidth(LEFT_PANEL_LIMITS, RIGHT_PANEL_LIMITS.min, windowWidth()),
      );
      const right = clampPanelWidth(
        saved.rightWidth,
        RIGHT_PANEL_LIMITS,
        maxPanelWidth(RIGHT_PANEL_LIMITS, left, windowWidth()),
      );
      set({ leftWidth: left, rightWidth: right });
    },
  };
});
