import { create } from "zustand";
import {
  addNode,
  createEmptyScene,
  createHistory,
  createNode,
  duplicateNodes,
  normalizeHexColor,
  normalizeNodeName,
  recordChange,
  redoStep,
  removeNodes,
  resolveSelection,
  setTransforms,
  toggleInSelection,
  transformsEqual,
  undoStep,
  updateNode,
  type History,
  type PrimitiveKind,
  type Scene,
  type Transform,
  type TransformMode,
} from "@sceneroom/shared";

/** How far (in world units) a duplicate is placed from the original: x, y, z. */
const DUPLICATE_OFFSET: [number, number, number] = [1, 0, 0];

/** What one undo step restores: the scene and what was selected. */
export type Snapshot = { scene: Scene; selectedIds: string[] };

/**
 * The single source of truth for the scene. The store only holds state and calls the
 * pure functions from @sceneroom/shared; it contains no scene logic of its own.
 *
 * Every action that changes the scene records one undo step first (see `record`). Changing the
 * selection, the gizmo mode or snapping is not undoable, as in most editors.
 */
type SceneState = {
  scene: Scene;
  /** Ids of the selected nodes (empty = nothing selected). */
  selectedIds: string[];
  /** Which gizmo is shown on the selected node(s). */
  transformMode: TransformMode;
  /** Snap gizmo movement to steps (see SNAP in snapSettings.ts). Off = smooth. */
  snapEnabled: boolean;
  /** True while Shift is held: inverts snapEnabled for as long as it is held. */
  snapKeyHeld: boolean;
  /** Earlier states for Undo, and undone states for Redo. */
  history: History<Snapshot>;
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
  /** Takes back the last change. */
  undo: () => void;
  /** Puts back the last undone change. */
  redo: () => void;
};

function createInitialScene(): Scene {
  return addNode(createEmptyScene(), createNode("initial-cube", "cube"));
}

/** The history to store along with a change: the current state becomes the next Undo step. */
function record(state: SceneState, label: string): History<Snapshot> {
  return recordChange(state.history, {
    state: { scene: state.scene, selectedIds: state.selectedIds },
    label,
  });
}

export const useSceneStore = create<SceneState>()((set) => ({
  scene: createInitialScene(),
  selectedIds: [],
  transformMode: "translate",
  snapEnabled: false,
  snapKeyHeld: false,
  history: createHistory<Snapshot>(),
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
    set((state) => {
      const node = state.scene.nodes[id];
      // Letting go of the gizmo without moving it must not leave an empty undo step
      if (!node || transformsEqual(node.transform, transform)) return state;
      return {
        scene: setTransforms(state.scene, { [id]: transform }),
        history: record(state, "Transform"),
      };
    }),
  setNodeTransforms: (updates) =>
    set((state) => {
      const changed = Object.fromEntries(
        Object.entries(updates).filter(([id, transform]) => {
          const node = state.scene.nodes[id];
          return node && !transformsEqual(node.transform, transform);
        }),
      );
      if (Object.keys(changed).length === 0) return state;
      return {
        scene: setTransforms(state.scene, changed),
        history: record(state, "Transform"),
      };
    }),
  addPrimitive: (kind) => {
    const id = crypto.randomUUID();
    set((state) => ({
      scene: addNode(state.scene, createNode(id, kind)),
      selectedIds: [id],
      history: record(state, `Add ${kind}`),
    }));
    return id;
  },
  deleteSelected: () =>
    set((state) => {
      if (state.selectedIds.length === 0) return state;
      const count = state.selectedIds.length;
      return {
        scene: removeNodes(state.scene, state.selectedIds),
        selectedIds: [],
        history: record(
          state,
          count > 1 ? `Delete ${count} objects` : "Delete",
        ),
      };
    }),
  duplicateSelected: () =>
    set((state) => {
      if (state.selectedIds.length === 0) return state;
      const result = duplicateNodes(
        state.scene,
        state.selectedIds,
        () => crypto.randomUUID(),
        DUPLICATE_OFFSET,
      );
      return {
        scene: result.scene,
        selectedIds: result.rootIds,
        history: record(state, "Duplicate"),
      };
    }),
  setNodeVisible: (id, visible) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node || node.visible === visible) return state;
      return {
        scene: updateNode(state.scene, id, { visible }),
        history: record(state, visible ? "Show" : "Hide"),
      };
    }),
  setNodeColor: (id, color) => {
    const clean = normalizeHexColor(color);
    if (clean === null) return null;
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node || node.color === clean) return state;
      return {
        scene: updateNode(state.scene, id, { color: clean }),
        history: record(state, "Change colour"),
      };
    });
    return clean;
  },
  renameNode: (id, name) => {
    const clean = normalizeNodeName(name);
    if (clean === null) return null;
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node || node.name === clean) return state;
      return {
        scene: updateNode(state.scene, id, { name: clean }),
        history: record(state, "Rename"),
      };
    });
    return clean;
  },
  undo: () =>
    set((state) => {
      const step = undoStep(state.history, {
        scene: state.scene,
        selectedIds: state.selectedIds,
      });
      if (!step) return state;
      return {
        scene: step.state.scene,
        selectedIds: resolveSelection(step.state.scene, step.state.selectedIds),
        history: step.history,
      };
    }),
  redo: () =>
    set((state) => {
      const step = redoStep(state.history, {
        scene: state.scene,
        selectedIds: state.selectedIds,
      });
      if (!step) return state;
      return {
        scene: step.state.scene,
        selectedIds: resolveSelection(step.state.scene, step.state.selectedIds),
        history: step.history,
      };
    }),
}));
