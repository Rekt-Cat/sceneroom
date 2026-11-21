import { create } from "zustand";
import { DEFAULT_BRUSH } from "@sceneroom/shared";

/**
 * Paint mode: painting on the surface of one mesh. `nodeId` is the object being painted (null = not painting).
 * The brush settings are kept between sessions. This is screen state, not scene data: the paint itself is
 * stored as a texture file and each stroke is an undo step of the scene.
 */
/** What the brush paints: the colour, or how rough or how metal the surface is. */
export type PaintLayer = "color" | "roughness" | "metalness";

/**
 * The value the brush paints for each layer when the layer is chosen (and what its reset button goes back to). Far from
 * the usual surface (roughness 0.6, metalness 0) so that a first stroke is easy to see: shiny, and fully metal.
 */
export const LAYER_DEFAULT_VALUE: Record<PaintLayer, number> = {
  color: 0.5,
  roughness: 0.1,
  metalness: 1,
};

type PaintState = {
  nodeId: string | null;
  /** Colour as "#rrggbb", size in pixels of the picture, hardness 0 to 1, strength 0 to 1. */
  color: string;
  radius: number;
  hardness: number;
  opacity: number;
  layer: PaintLayer;
  /** The roughness or metalness the brush paints, 0 to 1. */
  value: number;
  /** True: the brush puts back the object's own colour (it erases the paint) instead of its colour. */
  erase: boolean;
  /** Raised when the picture in the paint session is replaced (Undo or Redo), so the surface is drawn again. */
  version: number;
  setNodeId: (nodeId: string | null) => void;
  setBrush: (
    change: Partial<
      Pick<
        PaintState,
        | "color"
        | "radius"
        | "hardness"
        | "opacity"
        | "erase"
        | "layer"
        | "value"
      >
    >,
  ) => void;
  bump: () => void;
};

export const usePaintStore = create<PaintState>()((set) => ({
  nodeId: null,
  ...DEFAULT_BRUSH,
  erase: false,
  layer: "color",
  value: LAYER_DEFAULT_VALUE.roughness,
  version: 0,
  setNodeId: (nodeId) => set({ nodeId }),
  setBrush: (change) => set(change),
  bump: () => set((state) => ({ version: state.version + 1 })),
}));
