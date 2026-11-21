import { create } from "zustand";
import { DEFAULT_BRUSH } from "@sceneroom/shared";

/**
 * Paint mode: painting on the surface of one mesh. `nodeId` is the object being painted (null = not painting).
 * The brush settings are kept between sessions. This is screen state, not scene data: the paint itself is
 * stored as a texture file and each stroke is an undo step of the scene.
 */
type PaintState = {
  nodeId: string | null;
  /** Colour as "#rrggbb", size in pixels of the picture, hardness 0 to 1, strength 0 to 1. */
  color: string;
  radius: number;
  hardness: number;
  opacity: number;
  /** True: the brush puts back the object's own colour (it erases the paint) instead of its colour. */
  erase: boolean;
  /** Raised when the picture in the paint session is replaced (Undo or Redo), so the surface is drawn again. */
  version: number;
  setNodeId: (nodeId: string | null) => void;
  setBrush: (
    change: Partial<
      Pick<PaintState, "color" | "radius" | "hardness" | "opacity" | "erase">
    >,
  ) => void;
  bump: () => void;
};

export const usePaintStore = create<PaintState>()((set) => ({
  nodeId: null,
  ...DEFAULT_BRUSH,
  erase: false,
  version: 0,
  setNodeId: (nodeId) => set({ nodeId }),
  setBrush: (change) => set(change),
  bump: () => set((state) => ({ version: state.version + 1 })),
}));
