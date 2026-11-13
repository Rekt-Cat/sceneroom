import { create } from "zustand";
import {
  addNode,
  createEmptyScene,
  createNode,
  resolveSelection,
  setTransform,
  type PrimitiveKind,
  type Scene,
  type Transform,
  type TransformMode,
} from "@sceneroom/shared";

/**
 * The single source of truth for the scene. The store only holds state and calls the
 * pure functions from @sceneroom/shared; it contains no scene logic of its own.
 */
type SceneState = {
  scene: Scene;
  /** Id of the selected node, or null. */
  selectedId: string | null;
  /** Which gizmo is shown on the selected node. */
  transformMode: TransformMode;
  /** Snap gizmo movement to steps (see SNAP in SelectionGizmo.tsx). */
  snapEnabled: boolean;
  select: (id: string | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  toggleSnap: () => void;
  setNodeTransform: (id: string, transform: Transform) => void;
  addPrimitive: (kind: PrimitiveKind) => string;
};

function createInitialScene(): Scene {
  return addNode(createEmptyScene(), createNode("initial-cube", "cube"));
}

export const useSceneStore = create<SceneState>()((set) => ({
  scene: createInitialScene(),
  selectedId: null,
  transformMode: "translate",
  snapEnabled: true,
  select: (id) =>
    set((state) => ({ selectedId: resolveSelection(state.scene, id) })),
  setTransformMode: (mode) => set({ transformMode: mode }),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  setNodeTransform: (id, transform) =>
    set((state) => ({ scene: setTransform(state.scene, id, transform) })),
  addPrimitive: (kind) => {
    const id = crypto.randomUUID();
    set((state) => ({ scene: addNode(state.scene, createNode(id, kind)) }));
    return id;
  },
}));
