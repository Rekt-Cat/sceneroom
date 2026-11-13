import { create } from "zustand";
import {
  addNode,
  createEmptyScene,
  createNode,
  type PrimitiveKind,
  type Scene,
} from "@sceneroom/shared";

/**
 * The single source of truth for the scene. The store only holds state and calls the
 * pure functions from @sceneroom/shared; it contains no scene logic of its own.
 */
type SceneState = {
  scene: Scene;
  addPrimitive: (kind: PrimitiveKind) => string;
};

function createInitialScene(): Scene {
  return addNode(createEmptyScene(), createNode("initial-cube", "cube"));
}

export const useSceneStore = create<SceneState>()((set) => ({
  scene: createInitialScene(),
  addPrimitive: (kind) => {
    const id = crypto.randomUUID();
    set((state) => ({ scene: addNode(state.scene, createNode(id, kind)) }));
    return id;
  },
}));
