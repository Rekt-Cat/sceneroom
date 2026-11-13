import { create } from "zustand";
import {
  addNode,
  createEmptyScene,
  createNode,
  duplicateNodes,
  normalizeHexColor,
  normalizeNodeName,
  removeNodes,
  resolveSelection,
  setTransforms,
  toggleInSelection,
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
  /** Ids of the selected nodes (empty = nothing selected). */
  selectedIds: string[];
  /** Which gizmo is shown on the selected node(s). */
  transformMode: TransformMode;
  /** Snap gizmo movement to steps (see SNAP in SelectionGizmo.tsx). Off = smooth. */
  snapEnabled: boolean;
  /** True while Shift is held: inverts snapEnabled for as long as it is held. */
  snapKeyHeld: boolean;
  /** Selects only this node, or clears the selection when given null. */
  select: (id: string | null) => void;
  /** Adds the node to the selection, or removes it if already selected (Shift + click). */
  toggleSelect: (id: string) => void;
  /** Replaces the selection (used by the drag-a-box selection). */
  setSelection: (ids: string[]) => void;
  setTransformMode: (mode: TransformMode) => void;
  toggleSnap: () => void;
  setSnapKeyHeld: (held: boolean) => void;
  setNodeTransform: (id: string, transform: Transform) => void;
  /** Sets the transforms of several nodes as one change (one drag of the group gizmo). */
  setNodeTransforms: (updates: Record<string, Transform>) => void;
  /** Adds a new object and selects it. Returns its id. */
  addPrimitive: (kind: PrimitiveKind) => string;
  /** Deletes the selected objects and everything below them. */
  deleteSelected: () => void;
  /** Copies the selected objects (and everything below them), placed beside the originals, and selects the copies. */
  duplicateSelected: () => void;
  /** Shows or hides a node in the viewport. */
  setNodeVisible: (id: string, visible: boolean) => void;
  /** Sets a node's colour. Returns the saved "#rrggbb" colour, or null if the text was not a valid colour. */
  setNodeColor: (id: string, color: string) => string | null;
  /** Renames a node. Returns the saved name, or null if the name was not allowed. */
  renameNode: (id: string, name: string) => string | null;
};

function createInitialScene(): Scene {
  return addNode(createEmptyScene(), createNode("initial-cube", "cube"));
}

export const useSceneStore = create<SceneState>()((set) => ({
  scene: createInitialScene(),
  selectedIds: [],
  transformMode: "translate",
  snapEnabled: false,
  snapKeyHeld: false,
  select: (id) =>
    set((state) => ({
      selectedIds: id === null ? [] : resolveSelection(state.scene, [id]),
    })),
  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: resolveSelection(
        state.scene,
        toggleInSelection(state.selectedIds, id),
      ),
    })),
  setSelection: (ids) =>
    set((state) => ({ selectedIds: resolveSelection(state.scene, ids) })),
  setTransformMode: (mode) => set({ transformMode: mode }),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  setSnapKeyHeld: (held) => set({ snapKeyHeld: held }),
  setNodeTransform: (id, transform) =>
    set((state) => ({
      scene: setTransforms(state.scene, { [id]: transform }),
    })),
  setNodeTransforms: (updates) =>
    set((state) => ({ scene: setTransforms(state.scene, updates) })),
  addPrimitive: (kind) => {
    const id = crypto.randomUUID();
    set((state) => ({
      scene: addNode(state.scene, createNode(id, kind)),
      selectedIds: [id],
    }));
    return id;
  },
  deleteSelected: () =>
    set((state) =>
      state.selectedIds.length === 0
        ? state
        : {
            scene: removeNodes(state.scene, state.selectedIds),
            selectedIds: [],
          },
    ),
  duplicateSelected: () =>
    set((state) => {
      if (state.selectedIds.length === 0) return state;
      const result = duplicateNodes(
        state.scene,
        state.selectedIds,
        () => crypto.randomUUID(),
        DUPLICATE_OFFSET,
      );
      return { scene: result.scene, selectedIds: result.rootIds };
    }),
  setNodeVisible: (id, visible) =>
    set((state) => ({ scene: updateNode(state.scene, id, { visible }) })),
  setNodeColor: (id, color) => {
    const clean = normalizeHexColor(color);
    if (clean === null) return null;
    set((state) => ({ scene: updateNode(state.scene, id, { color: clean }) }));
    return clean;
  },
  renameNode: (id, name) => {
    const clean = normalizeNodeName(name);
    if (clean === null) return null;
    set((state) => ({ scene: updateNode(state.scene, id, { name: clean }) }));
    return clean;
  },
}));
