import { create } from "zustand";
import type { Rect } from "@sceneroom/shared";

/** The selection box being dragged right now, in screen pixels (null = no box). */
type BoxSelectState = {
  rect: Rect | null;
  setRect: (rect: Rect | null) => void;
};

export const useBoxSelectStore = create<BoxSelectState>()((set) => ({
  rect: null,
  setRect: (rect) => set({ rect }),
}));
