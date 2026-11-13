import { create } from "zustand";
import {
  addNode,
  createEmptyScene,
  createNode,
  duplicateNode,
  getSubtreeIds,
  normalizeNodeName,
  removeNode,
  resolveSelection,
  setTransform,
  updateNode,
  type PrimitiveKind,
  type Scene,
  type Transform,
  type TransformMode,
} from "@sceneroom/shared";

/** How far (in world units) a duplicate is placed from the original: x, y, z. */
const DUPLICATE_OFFSET: [number, number, number] = [1, 0, 0];

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
  /** Snap gizmo movement to steps (see SNAP in SelectionGizmo.tsx). Off = smooth. */
  snapEnabled: boolean;
  /** True while Shift is held: inverts snapEnabled for as long as it is held. */
  snapKeyHeld: boolean;
  select: (id: string | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  toggleSnap: () => void;
  setSnapKeyHeld: (held: boolean) => void;
  setNodeTransform: (id: string, transform: Transform) => void;
  /** Adds a new object and selects it. Returns its id. */
  addPrimitive: (kind: PrimitiveKind) => string;
  /** Deletes the selected object and everything below it. */
  deleteSelected: () => void;
  /** Copies the selected object (and everything below it), placed beside it, and selects the copy. */
  duplicateSelected: () => void;
  /** Renames a node. Returns the saved name, or null if the name was not allowed. */
  renameNode: (id: string, name: string) => string | null;
};

function createInitialScene(): Scene {
  return addNode(createEmptyScene(), createNode("initial-cube", "cube"));
}

export const useSceneStore = create<SceneState>()((set) => ({
  scene: createInitialScene(),
  selectedId: null,
  transformMode: "translate",
  snapEnabled: false,
  snapKeyHeld: false,
  select: (id) =>
    set((state) => ({ selectedId: resolveSelection(state.scene, id) })),
  setTransformMode: (mode) => set({ transformMode: mode }),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  setSnapKeyHeld: (held) => set({ snapKeyHeld: held }),
  setNodeTransform: (id, transform) =>
    set((state) => ({ scene: setTransform(state.scene, id, transform) })),
  addPrimitive: (kind) => {
    const id = crypto.randomUUID();
    set((state) => ({
      scene: addNode(state.scene, createNode(id, kind)),
      selectedId: id,
    }));
    return id;
  },
  deleteSelected: () =>
    set((state) =>
      state.selectedId
        ? { scene: removeNode(state.scene, state.selectedId), selectedId: null }
        : state,
    ),
  duplicateSelected: () =>
    set((state) => {
      if (!state.selectedId) return state;
      const newIds = getSubtreeIds(state.scene, state.selectedId).map(() =>
        crypto.randomUUID(),
      );
      return {
        scene: duplicateNode(
          state.scene,
          state.selectedId,
          newIds,
          DUPLICATE_OFFSET,
        ),
        selectedId: newIds[0] ?? null,
      };
    }),
  renameNode: (id, name) => {
    const clean = normalizeNodeName(name);
    if (clean === null) return null;
    set((state) => ({ scene: updateNode(state.scene, id, { name: clean }) }));
    return clean;
  },
}));
