import { create } from "zustand";
import type { Texture } from "three";

/**
 * The generated picture of the world that shiny surfaces reflect (null when reflections are off).
 * `SceneEnvironment` makes it; objects read it to show their own reflection strength.
 */
export const useEnvironmentTexture = create<{
  texture: Texture | null;
  set: (texture: Texture | null) => void;
}>()((set) => ({
  texture: null,
  set: (texture) => set({ texture }),
}));
