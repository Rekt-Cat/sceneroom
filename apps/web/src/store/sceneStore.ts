import { create } from "zustand";
import {
  addNode,
  createEmptyScene,
  createNode,
  resolveSelection,
  type PrimitiveKind,
  type Scene,
} from "@sceneroom/shared";

/**
 * The single source of truth for the scene. The store only holds state and calls the
 * pure functions from @sceneroom/shared; it contains no scene logic of its own.
 */
type SceneState = {
  scene: Scene;
  /** Id of the selected node, or null. */
  selectedId: string | null;
  select: (id: string | null) => void;
  addPrimitive: (kind: PrimitiveKind) => string;
};

function createInitialScene(): Scene {
  return addNode(createEmptyScene(), createNode("initial-cube", "cube"));
}

export const useSceneStore = create<SceneState>()((set) => ({
  scene: createInitialScene(),
  selectedId: null,
  select: (id) =>
    set((state) => ({ selectedId: resolveSelection(state.scene, id) })),
  addPrimitive: (kind) => {
    const id = crypto.randomUUID();
    set((state) => ({ scene: addNode(state.scene, createNode(id, kind)) }));
    return id;
  },
}));
