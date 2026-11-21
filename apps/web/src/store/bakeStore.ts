import { create } from "zustand";

/** Sizes the baked picture can have (pixels along each side). */
export const BAKE_SIZES = [256, 512, 1024, 2048] as const;

/** How far above the surface the baking rays start, as a share of the object's size (its box diagonal). */
export const DEFAULT_CAGE = 0.1;
export const DEFAULT_BAKE_SIZE = 1024;

/**
 * Baking: what the Bake section has chosen, and how far a running bake has got. Screen state, not scene data: the
 * result is a texture file and one undo step of the scene.
 */
type BakeState = {
  /** The dense object to copy detail from ("" = none chosen). */
  highId: string;
  size: number;
  cage: number;
  /** The object being baked, or null when no bake is running. */
  runningFor: string | null;
  /** 0 to 1. */
  progress: number;
  /** Set by Cancel; the running bake stops at its next step. */
  cancelled: boolean;
  setChoice: (
    change: Partial<Pick<BakeState, "highId" | "size" | "cage">>,
  ) => void;
  start: (nodeId: string) => void;
  setProgress: (progress: number) => void;
  cancel: () => void;
  finish: () => void;
};

export const useBakeStore = create<BakeState>()((set) => ({
  highId: "",
  size: DEFAULT_BAKE_SIZE,
  cage: DEFAULT_CAGE,
  runningFor: null,
  progress: 0,
  cancelled: false,
  setChoice: (change) => set(change),
  start: (runningFor) => set({ runningFor, progress: 0, cancelled: false }),
  setProgress: (progress) => set({ progress }),
  cancel: () => set({ cancelled: true }),
  finish: () => set({ runningFor: null, progress: 0, cancelled: false }),
}));
