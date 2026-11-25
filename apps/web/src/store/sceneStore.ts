import { create } from "zustand";
import { redoOnline, undoOnline } from "@/collab/collabHistory";
import {
  isBlockedByOthers,
  selectableIds,
  tellBlocked,
} from "@/collab/blockedByOthers";
import { useCollabStore } from "@/collab/collabStore";
import {
  IDENTITY_TRANSFORM,
  addAsset,
  addNode,
  availableName,
  CHARACTER_PRESETS,
  CHARACTER_PRESET_INFO,
  bakeCharacterToMeshes,
  bakePlantToMeshes,
  bakeToMesh,
  createEmptyScene,
  createHistory,
  copyToClipboard,
  MAX_MODIFIERS,
  addModifier,
  PLANT_PRESETS,
  PLANT_PRESET_INFO,
  characterChangeDiffers,
  createCharacterNode,
  createLightNode,
  createPlantNode,
  createPlantNodeFrom,
  createModifier,
  createModelNode,
  createNode,
  duplicateModifier,
  duplicateNodes,
  environmentChangeDiffers,
  editableIds as sceneEditableIds,
  fitScale,
  isEffectivelyLocked as sceneIsEffectivelyLocked,
  lightChangeDiffers,
  modifierChangeDiffers,
  moveModifier,
  removeModifier,
  normalizeHexColor,
  normalizeNodeName,
  plantChangeDiffers,
  pasteFromClipboard,
  placePrefab,
  rebuildAsInstance,
  syncPrefabInstances,
  unlinkPrefab,
  unlinkPrefabInstance,
  recordChange,
  redoStep,
  removeAsset,
  replaceMesh,
  setMaterialMap,
  type PaintSlot,
  renameAsset,
  removeNodes,
  reparentNodes,
  resolveSelection,
  materialChangeDiffers,
  sanitizeEnvironmentChange,
  sanitizeModifierChange,
  sanitizeCharacterChange,
  sanitizeLightChange,
  sanitizePlantChange,
  scatterCharacters,
  scatterPlants,
  sanitizeMaterialChange,
  setEnvironment,
  setModifier,
  setSegments,
  supportsModifiers,
  setCharacter,
  setLight,
  setPlant,
  setMaterial,
  setAssetNote,
  setTransforms,
  toggleInSelection,
  transformsEqual,
  undoStep,
  updateNode,
  type AssetInfo,
  type ClipboardData,
  type EnvironmentChange,
  type History,
  type LightChange,
  type BakedPiece,
  type CharacterChange,
  type CharacterPresetName,
  type CustomPlant,
  type Prefab,
  type LightKind,
  type PlantChange,
  type PlantPresetName,
  type Scatter,
  type ModifierChange,
  type ModifierType,
  type MaterialChange,
  type PrimitiveKind,
  type ReparentMove,
  type SceneNode,
  type Scene,
  type Transform,
  type TransformMode,
} from "@sceneroom/shared";

/**
 * An object is out of bounds for editing when its owner locked it (the padlock, also through a parent) or when someone else
 * online holds it by having it selected (collab/objectHolds.ts). Every action asks these two, so a held object is refused
 * like a locked one.
 */
const isEffectivelyLocked = (scene: Scene, id: string): boolean =>
  sceneIsEffectivelyLocked(scene, id) || isBlockedByOthers(id);

const editableIds = (scene: Scene, ids: readonly string[]): string[] =>
  sceneEditableIds(scene, ids).filter((id) => !isBlockedByOthers(id));

/** A selection without the objects someone else holds (and a message saying who has the first of them). */
const selectable = (scene: Scene, ids: string[]): string[] =>
  selectableIds(ids, (id) => scene.nodes[id]?.name ?? id);

/** How far (in world units) a duplicate is placed from the original: x, y, z. */
const DUPLICATE_OFFSET: [number, number, number] = [1, 0, 0];

/** What one undo step restores: the scene and what was selected. */
export type Snapshot = { scene: Scene; selectedIds: string[] };

/** Everything that belongs to one scene of the project while it is open: contents, selection, undo history. */
export type ParkedScene = {
  scene: Scene;
  selectedIds: string[];
  history: History<Snapshot>;
};

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
  /** What Copy or Cut set aside, waiting to be pasted. Not part of the undo history. */
  clipboard: ClipboardData | null;
  /** Earlier states for Undo, and undone states for Redo. */
  history: History<Snapshot>;
  /**
   * A change in progress that should become ONE undo step when it ends, such as dragging a value
   * in the Inspector. `before` is the state to return to.
   */
  pendingEdit: { before: Snapshot; label: string } | null;
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
  /**
   * Puts an imported model in the scene (and remembers the file's details), scaled to a sensible size,
   * and selects it. One undo step. Returns the new object's id.
   */
  importModel: (info: AssetInfo) => string;
  /**
   * Adds another object that shows an already imported file (from the Assets panel), at the middle of
   * the scene, and selects it. One undo step. Returns the new object's id, or null if the file is unknown.
   */
  placeAsset: (assetId: string, at?: [number, number, number]) => string | null;
  /**
   * Places an imported model given its record (which may come from another scene of the project: the record is
   * added to this scene first). One undo step. Returns the new object's id.
   */
  placeModel: (info: AssetInfo, at?: [number, number, number]) => string;
  /** Places a linked instance of a prefab and selects it. One undo step. Returns the new object's id. */
  placePrefabInstance: (
    prefab: Prefab,
    at?: [number, number, number],
  ) => string;
  /** Turns the object a prefab was just made from into a linked copy of it, in place. One undo step. */
  convertToPrefabInstance: (nodeId: string, prefab: Prefab) => void;
  /** Rebuilds every instance of the prefab in this scene from it. One undo step. */
  syncPrefab: (prefab: Prefab) => void;
  /** Turns a prefab copy into an ordinary object. One undo step. */
  unlinkPrefabNode: (nodeId: string) => void;
  /** Frees every object of this scene that is linked to the prefab (when the prefab is deleted). One undo step. */
  unlinkPrefabEverywhere: (prefabId: string) => void;
  /** Adds a modifier (bend, twist, taper) to the end of an object's list. One undo step. Ignored for locked objects and objects that cannot have modifiers. */
  addModifier: (nodeId: string, type: ModifierType) => void;
  /** Removes a modifier. One undo step. */
  removeModifier: (nodeId: string, modifierId: string) => void;
  /** Changes some settings of a modifier as one undo step. */
  setModifier: (
    nodeId: string,
    modifierId: string,
    change: ModifierChange,
  ) => void;
  /** Like setModifier but without an undo step; only while an edit is in progress (dragging a slider). */
  previewModifier: (
    nodeId: string,
    modifierId: string,
    change: ModifierChange,
  ) => void;
  /** Copies a modifier and puts the copy right after it. One undo step. */
  duplicateModifier: (nodeId: string, modifierId: string) => void;
  /** Moves a modifier one place up or down the list (the order changes the result). One undo step. */
  moveModifier: (
    nodeId: string,
    modifierId: string,
    direction: "up" | "down",
  ) => void;
  /** Sets how finely a shape is cut up (1 to 32), as one undo step. */
  setNodeSegments: (nodeId: string, segments: number) => void;
  /** Like setNodeSegments but without an undo step; only while an edit is in progress. */
  previewNodeSegments: (nodeId: string, segments: number) => void;
  /**
   * Turns an object into an editable mesh pointing to the stored data `info` (see `bakeToMesh`), as one
   * undo step with the given label. Ignored for locked objects and objects that cannot become a mesh.
   */
  bakeNodeToMesh: (nodeId: string, info: AssetInfo, label: string) => void;
  /**
   * Makes an editable mesh object point to a NEW stored version of its mesh (after its points were
   * edited), as one undo step with the given label. Ignored for locked objects and objects that are not meshes.
   */
  /**
   * Makes the object use another version of its mesh, as one undo step. With `amend` there is no new undo step:
   * the change takes the place of the one just made (used to change the settings of an extrusion).
   */
  replaceNodeMesh: (
    nodeId: string,
    info: AssetInfo,
    label: string,
    amend?: boolean,
  ) => void;
  /** Gives an object a painted picture (a texture file) in one of its slots (colour, or roughness and metalness), or null to remove it. One undo step. Ignored for locked objects. */
  setNodeMap: (
    nodeId: string,
    slot: PaintSlot,
    info: AssetInfo | null,
    label: string,
  ) => void;
  /** Adds a character (person, child, stocky or tall) at the middle of the scene, standing at rest, and selects it. One undo step. Returns its id. */
  addCharacter: (preset: CharacterPresetName) => string;
  /** Changes some settings of a character (including its whole pose) as one undo step. Ignored for locked objects and objects that are not characters. */
  setNodeCharacter: (id: string, change: CharacterChange) => void;
  /** Like setNodeCharacter but without an undo step; only while an edit is in progress (dragging a slider). */
  previewNodeCharacter: (id: string, change: CharacterChange) => void;
  /** Gives a character the proportions, clothes and colours of a kind, keeping its pose. One undo step. */
  applyCharacterPreset: (id: string, preset: CharacterPresetName) => void;
  /** Adds a crowd: a copy of a character at each spot, each with its own look, selects them and returns their ids. One undo step. */
  scatterCharacter: (id: string, spots: readonly Scatter[]) => string[];
  /** Turns a character into editable meshes, one per colour (see `bakeCharacterToMeshes`). One undo step. Ignored for locked objects and objects that are not characters. */
  bakeCharacterNode: (id: string, pieces: readonly BakedPiece[]) => void;
  /** Adds a plant a person saved ("my plants"), with a new random seed, at the middle of the scene, and selects it. One undo step. Returns its id. */
  addCustomPlant: (item: CustomPlant) => string;
  /** Adds a plant (tree, pine or bush) at the middle of the scene with a random-looking seed, and selects it. One undo step. Returns its id. */
  addPlant: (preset: PlantPresetName) => string;
  /** Changes some settings of a plant as one undo step. Ignored for locked objects and objects that are not plants. */
  setNodePlant: (id: string, change: PlantChange) => void;
  /** Like setNodePlant but without an undo step; only while an edit is in progress (dragging a slider). */
  previewNodePlant: (id: string, change: PlantChange) => void;
  /** Gives a plant the numbers and trunk colour of a preset, keeping its seed. One undo step. */
  applyPlantPreset: (id: string, preset: PlantPresetName) => void;
  /** Adds copies of a plant at the given spots (a forest), selects them and returns their ids. One undo step. */
  scatterPlant: (id: string, spots: readonly Scatter[]) => string[];
  /**
   * Turns a plant into editable meshes: the object becomes the wood and a new object inside it holds the
   * leaves (see `bakePlantToMeshes`). One undo step. Ignored for locked objects and objects that are not plants.
   */
  bakePlantNode: (
    id: string,
    barkInfo: AssetInfo,
    leaves: { info: AssetInfo; nodeId: string } | null,
  ) => void;
  /** Changes some settings of the world (background, reflections, fog, base lighting) as one undo step. */
  setEnvironmentSettings: (change: EnvironmentChange) => void;
  /** Like setEnvironmentSettings but without an undo step; only while an edit is in progress (dragging a slider). */
  previewEnvironmentSettings: (change: EnvironmentChange) => void;
  /** Adds a light of this kind (aimed at the middle of the scene) and selects it. One undo step. Returns its id. */
  addLight: (kind: LightKind) => string;
  /** Changes some settings of a light object as one undo step. Ignored for locked objects and objects that are not lights. */
  setNodeLight: (id: string, change: LightChange) => void;
  /** Like setNodeLight but without an undo step; only while an edit is in progress (dragging a slider). */
  previewNodeLight: (id: string, change: LightChange) => void;
  /** Renames an imported file in the Assets panel (objects keep their names). One undo step. */
  renameAsset: (assetId: string, name: string) => void;
  /** Sets an imported file's source / licence note. One undo step. */
  setAssetNote: (assetId: string, note: string) => void;
  /** Deletes an imported file and every object that shows it, as one undo step. */
  deleteAsset: (assetId: string) => void;
  /** Deletes the selected objects and everything below them. Locked objects are left alone. */
  deleteSelected: () => void;
  /** Copies the selected objects (and everything below them), placed beside the originals, and selects the copies. */
  duplicateSelected: () => void;
  /**
   * Moves objects under new parents (null = top level), and to a place among the objects there, as one
   * undo step. Moves that change nothing record nothing. Throws if a move would make a loop; check with
   * canReparent first.
   */
  reparentNodes: (moves: ReparentMove[], label: string) => void;
  /** Locks or unlocks nodes as one change. A locked node cannot be edited (see isEffectivelyLocked). */
  setNodesLocked: (ids: string[], locked: boolean) => void;
  /** Sets the selected objects aside to paste later. Changes nothing in the scene. */
  copySelected: () => void;
  /**
   * Marks the selected objects as cut (they are shown greyed). Nothing is deleted or moved until they
   * are pasted, which MOVES them. Locked objects cannot be cut. Changes nothing in the scene.
   */
  cutSelected: () => void;
  /**
   * Pastes a copy of what was copied into `parentId` (null = top level) and selects the new objects, as
   * one undo step. `rootTransforms` replaces the copied transforms of the top objects (by the id they
   * were copied from). Each paste lands one step further along. Does nothing if the clipboard holds a cut.
   */
  pasteCopies: (
    parentId: string | null,
    rootTransforms?: Record<string, Transform>,
  ) => void;
  /** Forgets what was copied or cut (a cut object stops being greyed). */
  clearClipboard: () => void;
  /** Puts position, rotation and scale of the selected objects back to their starting values, as one undo step. Locked ones are left alone. */
  resetSelectedTransforms: () => void;
  /** Shows or hides several nodes in the viewport as one change. */
  setNodesVisible: (ids: string[], visible: boolean) => void;
  /** Shows or hides a node in the viewport. */
  setNodeVisible: (id: string, visible: boolean) => void;
  /** Sets how shiny / metal an object looks (0 to 1 each), as one undo step. Ignored for locked objects. */
  setNodeMaterial: (id: string, change: MaterialChange) => void;
  /** Like setNodeMaterial but without recording an undo step; only while an edit is in progress (dragging a slider). */
  previewNodeMaterial: (id: string, change: MaterialChange) => void;
  /** Like setNodeColor but without recording an undo step; only while an edit is in progress (dragging inside the colour picker). */
  previewNodeColor: (id: string, color: string) => void;
  /** Sets a node's colour. Returns the saved "#rrggbb" colour, or null if the text was not a valid colour. */
  setNodeColor: (id: string, color: string) => string | null;
  /** Renames a node. Returns the saved name, or null if the name was not allowed. */
  renameNode: (id: string, name: string) => string | null;
  /** Replaces the whole scene (for example with the one saved in the browser). Clears the selection and the undo history. */
  /**
   * Counts how many times the whole scene was swapped for another one (opening a project, switching scene tabs).
   * The online sync watches it, to know that a change of `scene` is another scene and not an edit.
   */
  sceneEpoch: number;
  /**
   * Puts a scene that came from other people into the editor. Not an undo step, and not a local edit; the selection
   * keeps what still exists.
   */
  applyRemoteScene: (scene: Scene) => void;
  loadScene: (scene: Scene) => void;
  /**
   * Shows another scene of the project: its scene, selection and its own undo history. Used when switching
   * scenes. A cut waiting in the clipboard becomes a copy (the cut object stays in its own scene).
   */
  restoreScene: (parked: ParkedScene) => void;
  /** Starts an edit made of many small updates. Pair with endEdit. */
  beginEdit: (label: string) => void;
  /** Changes a node's transform while an edit is in progress, without recording undo steps. */
  previewNodeTransform: (id: string, transform: Transform) => void;
  /** Ends the edit: `true` keeps it as one undo step, `false` restores how things were. */
  endEdit: (keep: boolean) => void;
  /** Takes back the last change. */
  undo: () => void;
  /** Puts back the last undone change. */
  redo: () => void;
};

/** The model object standing at a spot on the ground instead of the middle (when a spot is given). */
function placedAt(node: SceneNode, at?: [number, number, number]): SceneNode {
  return at
    ? { ...node, transform: { ...node.transform, position: at } }
    : node;
}

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
  clipboard: null,
  pendingEdit: null,
  select: (id) =>
    set((state) => ({
      selectedIds:
        id === null
          ? []
          : selectable(state.scene, resolveSelection(state.scene, [id])),
    })),
  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: selectable(
        state.scene,
        resolveSelection(state.scene, toggleInSelection(state.selectedIds, id)),
      ),
    })),
  setSelection: (ids) =>
    set((state) => ({
      selectedIds: selectable(state.scene, resolveSelection(state.scene, ids)),
    })),
  setTransformMode: (mode) => set({ transformMode: mode }),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  setSnapKeyHeld: (held) => set({ snapKeyHeld: held }),
  setNodeTransform: (id, transform) =>
    set((state) => {
      const node = state.scene.nodes[id];
      // Letting go of the gizmo without moving it must not leave an empty undo step.
      // A locked object cannot be moved, whatever asked for it.
      if (
        !node ||
        isEffectivelyLocked(state.scene, id) ||
        transformsEqual(node.transform, transform)
      ) {
        return state;
      }
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
          return (
            node &&
            !isEffectivelyLocked(state.scene, id) &&
            !transformsEqual(node.transform, transform)
          );
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
  importModel: (info) => {
    const id = crypto.randomUUID();
    set((state) => ({
      scene: addNode(
        addAsset(state.scene, info),
        createModelNode(id, info.name, info.id, fitScale(info)),
      ),
      selectedIds: [id],
      history: record(state, `Import ${info.name}`),
    }));
    return id;
  },
  addModifier: (nodeId, type) =>
    set((state) => {
      const node = state.scene.nodes[nodeId];
      if (
        !node ||
        !supportsModifiers(node) ||
        node.modifiers.length >= MAX_MODIFIERS ||
        isEffectivelyLocked(state.scene, nodeId)
      ) {
        return state;
      }
      return {
        scene: addModifier(
          state.scene,
          nodeId,
          createModifier(crypto.randomUUID(), type),
        ),
        history: record(state, `Add ${type}`),
      };
    }),
  removeModifier: (nodeId, modifierId) =>
    set((state) => {
      if (isEffectivelyLocked(state.scene, nodeId)) return state;
      const scene = removeModifier(state.scene, nodeId, modifierId);
      if (scene === state.scene) return state;
      return { scene, history: record(state, "Remove modifier") };
    }),
  setModifier: (nodeId, modifierId, change) =>
    set((state) => {
      const modifier = state.scene.nodes[nodeId]?.modifiers.find(
        (m) => m.id === modifierId,
      );
      if (!modifier || isEffectivelyLocked(state.scene, nodeId)) return state;
      const clean = sanitizeModifierChange(modifier, change);
      if (!modifierChangeDiffers(modifier, clean)) return state;
      return {
        scene: setModifier(state.scene, nodeId, modifierId, clean),
        history: record(state, "Modifier"),
      };
    }),
  previewModifier: (nodeId, modifierId, change) =>
    set((state) => {
      const modifier = state.scene.nodes[nodeId]?.modifiers.find(
        (m) => m.id === modifierId,
      );
      if (
        !state.pendingEdit ||
        !modifier ||
        isEffectivelyLocked(state.scene, nodeId)
      ) {
        return state;
      }
      const clean = sanitizeModifierChange(modifier, change);
      if (Object.keys(clean).length === 0) return state;
      return { scene: setModifier(state.scene, nodeId, modifierId, clean) };
    }),
  duplicateModifier: (nodeId, modifierId) =>
    set((state) => {
      if (isEffectivelyLocked(state.scene, nodeId)) return state;
      const scene = duplicateModifier(
        state.scene,
        nodeId,
        modifierId,
        crypto.randomUUID(),
      );
      if (scene === state.scene) return state;
      return { scene, history: record(state, "Duplicate modifier") };
    }),
  moveModifier: (nodeId, modifierId, direction) =>
    set((state) => {
      if (isEffectivelyLocked(state.scene, nodeId)) return state;
      const scene = moveModifier(state.scene, nodeId, modifierId, direction);
      if (scene === state.scene) return state;
      return { scene, history: record(state, "Move modifier") };
    }),
  setNodeSegments: (nodeId, segments) =>
    set((state) => {
      const node = state.scene.nodes[nodeId];
      if (
        !node ||
        !supportsModifiers(node) ||
        isEffectivelyLocked(state.scene, nodeId)
      ) {
        return state;
      }
      const scene = setSegments(state.scene, nodeId, segments);
      if (scene === state.scene) return state;
      return { scene, history: record(state, "Segments") };
    }),
  previewNodeSegments: (nodeId, segments) =>
    set((state) => {
      const node = state.scene.nodes[nodeId];
      if (
        !state.pendingEdit ||
        !node ||
        !supportsModifiers(node) ||
        isEffectivelyLocked(state.scene, nodeId)
      ) {
        return state;
      }
      const scene = setSegments(state.scene, nodeId, segments);
      return scene === state.scene ? state : { scene };
    }),
  bakeNodeToMesh: (nodeId, info, label) =>
    set((state) => {
      const node = state.scene.nodes[nodeId];
      if (
        !node ||
        !supportsModifiers(node) ||
        isEffectivelyLocked(state.scene, nodeId)
      ) {
        return state;
      }
      return {
        scene: bakeToMesh(state.scene, nodeId, info),
        history: record(state, label),
      };
    }),
  replaceNodeMesh: (nodeId, info, label, amend = false) =>
    set((state) => {
      const node = state.scene.nodes[nodeId];
      if (
        !node ||
        node.kind !== "mesh" ||
        isEffectivelyLocked(state.scene, nodeId)
      ) {
        return state;
      }
      return {
        scene: replaceMesh(state.scene, nodeId, info),
        history: amend ? state.history : record(state, label),
      };
    }),
  setNodeMap: (nodeId, slot, info, label) =>
    set((state) => {
      const node = state.scene.nodes[nodeId];
      if (!node || isEffectivelyLocked(state.scene, nodeId)) return state;
      return {
        scene: setMaterialMap(state.scene, nodeId, slot, info),
        history: record(state, label),
      };
    }),
  addPlant: (preset) => {
    const id = crypto.randomUUID();
    // A seed that looks random: a different plant every time one is added
    const seed = Math.floor(Math.random() * 100000);
    set((state) => ({
      scene: addNode(state.scene, {
        ...createPlantNode(id, preset, seed),
        name: availableName(state.scene, PLANT_PRESET_INFO[preset].label),
      }),
      selectedIds: [id],
      history: record(state, `Add ${preset}`),
    }));
    return id;
  },
  addCharacter: (preset) => {
    const id = crypto.randomUUID();
    set((state) => ({
      scene: addNode(state.scene, {
        ...createCharacterNode(id, preset),
        name: availableName(state.scene, CHARACTER_PRESET_INFO[preset].label),
      }),
      selectedIds: [id],
      history: record(state, `Add ${preset}`),
    }));
    return id;
  },
  setNodeCharacter: (id, change) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node?.character || isEffectivelyLocked(state.scene, id))
        return state;
      const clean = sanitizeCharacterChange(change);
      if (!characterChangeDiffers(node.character, clean)) return state;
      return {
        scene: setCharacter(state.scene, id, clean),
        history: record(state, "Character"),
      };
    }),
  previewNodeCharacter: (id, change) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (
        !state.pendingEdit ||
        !node?.character ||
        isEffectivelyLocked(state.scene, id)
      ) {
        return state;
      }
      const clean = sanitizeCharacterChange(change);
      if (Object.keys(clean).length === 0) return state;
      return { scene: setCharacter(state.scene, id, clean) };
    }),
  applyCharacterPreset: (id, preset) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node?.character || isEffectivelyLocked(state.scene, id))
        return state;
      return {
        scene: setCharacter(state.scene, id, {
          ...CHARACTER_PRESETS[preset],
          pose: node.character.pose,
          onGround: node.character.onGround,
        }),
        history: record(state, `Make it a ${preset}`),
      };
    }),
  scatterCharacter: (id, spots) => {
    let ids: string[] = [];
    set((state) => {
      const node = state.scene.nodes[id];
      if (
        !node?.character ||
        isEffectivelyLocked(state.scene, id) ||
        spots.length === 0
      ) {
        return state;
      }
      const result = scatterCharacters(state.scene, id, spots, () =>
        crypto.randomUUID(),
      );
      ids = result.ids;
      return {
        scene: result.scene,
        selectedIds: result.ids,
        history: record(state, `Add a crowd of ${result.ids.length}`),
      };
    });
    return ids;
  },
  bakeCharacterNode: (id, pieces) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node?.character || isEffectivelyLocked(state.scene, id))
        return state;
      return {
        scene: bakeCharacterToMeshes(state.scene, id, pieces),
        history: record(state, "Make mesh"),
      };
    }),
  addCustomPlant: (item) => {
    const id = crypto.randomUUID();
    const seed = Math.floor(Math.random() * 100000);
    set((state) => ({
      scene: addNode(state.scene, {
        ...createPlantNodeFrom(id, item, seed),
        name: availableName(state.scene, item.name),
      }),
      selectedIds: [id],
      history: record(state, `Add ${item.name}`),
    }));
    return id;
  },
  setNodePlant: (id, change) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node?.plant || isEffectivelyLocked(state.scene, id)) return state;
      const clean = sanitizePlantChange(change);
      if (!plantChangeDiffers(node.plant, clean)) return state;
      return {
        scene: setPlant(state.scene, id, clean),
        history: record(state, "Plant"),
      };
    }),
  previewNodePlant: (id, change) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (
        !state.pendingEdit ||
        !node?.plant ||
        isEffectivelyLocked(state.scene, id)
      ) {
        return state;
      }
      const clean = sanitizePlantChange(change);
      if (Object.keys(clean).length === 0) return state;
      return { scene: setPlant(state.scene, id, clean) };
    }),
  applyPlantPreset: (id, preset) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node?.plant || isEffectivelyLocked(state.scene, id)) return state;
      const scene = updateNode(
        setPlant(state.scene, id, {
          ...PLANT_PRESETS[preset],
          seed: node.plant.seed,
        }),
        id,
        { color: PLANT_PRESET_INFO[preset].barkColor },
      );
      return { scene, history: record(state, `Make it a ${preset}`) };
    }),
  scatterPlant: (id, spots) => {
    let ids: string[] = [];
    set((state) => {
      const node = state.scene.nodes[id];
      if (
        !node?.plant ||
        isEffectivelyLocked(state.scene, id) ||
        spots.length === 0
      ) {
        return state;
      }
      const result = scatterPlants(state.scene, id, spots, () =>
        crypto.randomUUID(),
      );
      ids = result.ids;
      return {
        scene: result.scene,
        selectedIds: result.ids,
        history: record(state, `Scatter ${result.ids.length} plants`),
      };
    });
    return ids;
  },
  bakePlantNode: (id, barkInfo, leaves) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node?.plant || isEffectivelyLocked(state.scene, id)) return state;
      return {
        scene: bakePlantToMeshes(state.scene, id, barkInfo, leaves),
        history: record(state, "Make mesh"),
      };
    }),
  setEnvironmentSettings: (change) =>
    set((state) => {
      const clean = sanitizeEnvironmentChange(change);
      if (!environmentChangeDiffers(state.scene.environment, clean))
        return state;
      return {
        scene: setEnvironment(state.scene, clean),
        history: record(state, "Environment"),
      };
    }),
  previewEnvironmentSettings: (change) =>
    set((state) => {
      if (!state.pendingEdit) return state;
      const clean = sanitizeEnvironmentChange(change);
      if (Object.keys(clean).length === 0) return state;
      return { scene: setEnvironment(state.scene, clean) };
    }),
  addLight: (kind) => {
    const id = crypto.randomUUID();
    set((state) => ({
      scene: addNode(state.scene, createLightNode(id, kind)),
      selectedIds: [id],
      history: record(state, `Add ${kind} light`),
    }));
    return id;
  },
  setNodeLight: (id, change) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node?.light || isEffectivelyLocked(state.scene, id)) return state;
      const clean = sanitizeLightChange(node.kind as LightKind, change);
      if (!lightChangeDiffers(node.light, clean)) return state;
      return {
        scene: setLight(state.scene, id, clean),
        history: record(state, "Light"),
      };
    }),
  previewNodeLight: (id, change) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (
        !state.pendingEdit ||
        !node?.light ||
        isEffectivelyLocked(state.scene, id)
      ) {
        return state;
      }
      const clean = sanitizeLightChange(node.kind as LightKind, change);
      if (Object.keys(clean).length === 0) return state;
      return { scene: setLight(state.scene, id, clean) };
    }),
  placeAsset: (assetId, at): string | null => {
    const info = useSceneStore.getState().scene.assets[assetId];
    if (!info) return null;
    return useSceneStore.getState().placeModel(info, at);
  },
  placeModel: (info, at) => {
    const id = crypto.randomUUID();
    set((state) => ({
      scene: addNode(
        addAsset(state.scene, info),
        placedAt(
          createModelNode(
            id,
            availableName(state.scene, info.name),
            info.id,
            fitScale(info),
          ),
          at,
        ),
      ),
      selectedIds: [id],
      history: record(state, `Place ${info.name}`),
    }));
    return id;
  },
  placePrefabInstance: (prefab, at) => {
    const id = crypto.randomUUID();
    const top = prefab.nodes[0]!.transform.position;
    set((state) => ({
      scene: placePrefab(state.scene, prefab, id, () => crypto.randomUUID(), {
        // Dropped on the ground: the spot decides where, the prefab keeps its own height
        position: at ? [at[0], top[1], at[2]] : [0, top[1], 0],
      }),
      selectedIds: [id],
      history: record(state, `Place ${prefab.name}`),
    }));
    return id;
  },
  convertToPrefabInstance: (nodeId, prefab) =>
    set((state) => {
      if (!state.scene.nodes[nodeId]) return state;
      const scene = rebuildAsInstance(state.scene, nodeId, prefab, () =>
        crypto.randomUUID(),
      );
      return {
        scene,
        selectedIds: resolveSelection(scene, state.selectedIds),
        history: record(state, "Make prefab"),
      };
    }),
  syncPrefab: (prefab) =>
    set((state) => {
      const scene = syncPrefabInstances(state.scene, prefab, () =>
        crypto.randomUUID(),
      );
      if (scene === state.scene) return state;
      return {
        scene,
        selectedIds: resolveSelection(scene, state.selectedIds),
        history: record(state, "Update prefab copies"),
      };
    }),
  unlinkPrefabEverywhere: (prefabId) =>
    set((state) => {
      const scene = unlinkPrefab(state.scene, prefabId);
      if (scene === state.scene) return state;
      return { scene, history: record(state, "Delete prefab") };
    }),
  unlinkPrefabNode: (nodeId) =>
    set((state) => {
      const scene = unlinkPrefabInstance(state.scene, nodeId);
      if (scene === state.scene) return state;
      return { scene, history: record(state, "Unlink prefab") };
    }),
  renameAsset: (assetId, name) =>
    set((state) => {
      const scene = renameAsset(state.scene, assetId, name);
      if (scene === state.scene) return state;
      return { scene, history: record(state, "Rename asset") };
    }),
  setAssetNote: (assetId, note) =>
    set((state) => {
      const scene = setAssetNote(state.scene, assetId, note);
      if (scene === state.scene) return state;
      return { scene, history: record(state, "Edit asset note") };
    }),
  deleteAsset: (assetId) =>
    set((state) => {
      const result = removeAsset(state.scene, assetId);
      if (result.scene === state.scene) return state;
      return {
        scene: result.scene,
        selectedIds: resolveSelection(result.scene, state.selectedIds),
        history: record(state, "Delete asset"),
      };
    }),
  deleteSelected: () =>
    set((state) => {
      const ids = editableIds(state.scene, state.selectedIds);
      if (ids.length === 0) return state;
      const scene = removeNodes(state.scene, ids);
      return {
        scene,
        // Locked objects that were selected stay selected
        selectedIds: resolveSelection(scene, state.selectedIds),
        history: record(
          state,
          ids.length > 1 ? `Delete ${ids.length} objects` : "Delete",
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
  reparentNodes: (moves, label) =>
    set((state) => {
      // Moving an object, or putting one inside another, changes both: neither may be held by someone else
      const touched = moves.flatMap((move) =>
        move.parentId === null ? [move.id] : [move.id, move.parentId],
      );
      const refused = touched.find((id) => isBlockedByOthers(id));
      if (refused !== undefined) {
        tellBlocked(refused, state.scene.nodes[refused]?.name ?? refused);
        return state;
      }
      const scene = reparentNodes(state.scene, moves);
      // Moves that change nothing leave every object as it was (the same object), so they record no undo step
      const changed = Object.keys(scene.nodes).some(
        (id) => scene.nodes[id] !== state.scene.nodes[id],
      );
      if (!changed) return state;
      return { scene, history: record(state, label) };
    }),
  copySelected: () =>
    set((state) => {
      const clipboard = copyToClipboard(state.scene, state.selectedIds, "copy");
      return clipboard ? { clipboard } : state;
    }),
  cutSelected: () =>
    set((state) => {
      // A locked object cannot be moved, so it cannot be cut
      const clipboard = copyToClipboard(
        state.scene,
        editableIds(state.scene, state.selectedIds),
        "cut",
      );
      return clipboard ? { clipboard } : state;
    }),
  pasteCopies: (parentId, rootTransforms) =>
    set((state) => {
      const clipboard = state.clipboard;
      if (!clipboard || clipboard.mode !== "copy") return state;
      // A copy lands one step beside where it came from, and each further paste one step further
      const steps = clipboard.pasteCount + 1;
      const offset: [number, number, number] = [
        DUPLICATE_OFFSET[0] * steps,
        DUPLICATE_OFFSET[1] * steps,
        DUPLICATE_OFFSET[2] * steps,
      ];
      const result = pasteFromClipboard(
        state.scene,
        clipboard,
        () => crypto.randomUUID(),
        { parentId, offset, rootTransforms },
      );
      return {
        scene: result.scene,
        selectedIds: result.rootIds,
        clipboard: { ...clipboard, pasteCount: clipboard.pasteCount + 1 },
        history: record(state, "Paste"),
      };
    }),
  clearClipboard: () => set({ clipboard: null }),
  resetSelectedTransforms: () =>
    set((state) => {
      const changing = editableIds(state.scene, state.selectedIds).filter(
        (id) =>
          !transformsEqual(
            state.scene.nodes[id]!.transform,
            IDENTITY_TRANSFORM,
          ),
      );
      if (changing.length === 0) return state;
      const updates = Object.fromEntries(
        changing.map((id) => [id, IDENTITY_TRANSFORM]),
      );
      return {
        scene: setTransforms(state.scene, updates),
        history: record(state, "Reset transform"),
      };
    }),
  setNodesVisible: (ids, visible) =>
    set((state) => {
      const wanted = ids.filter(
        (id) =>
          state.scene.nodes[id] && state.scene.nodes[id].visible !== visible,
      );
      const changing = wanted.filter((id) => !isBlockedByOthers(id));
      if (changing.length < wanted.length) {
        const refused = wanted.find((id) => isBlockedByOthers(id))!;
        tellBlocked(refused, state.scene.nodes[refused]!.name);
      }
      if (changing.length === 0) return state;
      const scene = changing.reduce(
        (next, id) => updateNode(next, id, { visible }),
        state.scene,
      );
      return { scene, history: record(state, visible ? "Show" : "Hide") };
    }),
  setNodesLocked: (ids, locked) =>
    set((state) => {
      const wanted = ids.filter(
        (id) =>
          state.scene.nodes[id] && state.scene.nodes[id].locked !== locked,
      );
      const changing = wanted.filter((id) => !isBlockedByOthers(id));
      if (changing.length < wanted.length) {
        const refused = wanted.find((id) => isBlockedByOthers(id))!;
        tellBlocked(refused, state.scene.nodes[refused]!.name);
      }
      if (changing.length === 0) return state;
      const scene = changing.reduce(
        (next, id) => updateNode(next, id, { locked }),
        state.scene,
      );
      return { scene, history: record(state, locked ? "Lock" : "Unlock") };
    }),
  setNodeVisible: (id, visible) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node || node.visible === visible) return state;
      if (isBlockedByOthers(id)) {
        tellBlocked(id, node.name);
        return state;
      }
      return {
        scene: updateNode(state.scene, id, { visible }),
        history: record(state, visible ? "Show" : "Hide"),
      };
    }),
  setNodeMaterial: (id, change) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!node || isEffectivelyLocked(state.scene, id)) return state;
      const clean = sanitizeMaterialChange(change);
      if (!materialChangeDiffers(node.material, clean)) return state;
      return {
        scene: setMaterial(state.scene, id, clean),
        history: record(state, "Material"),
      };
    }),
  previewNodeMaterial: (id, change) =>
    set((state) => {
      const node = state.scene.nodes[id];
      if (!state.pendingEdit || !node || isEffectivelyLocked(state.scene, id)) {
        return state;
      }
      const clean = sanitizeMaterialChange(change);
      if (Object.keys(clean).length === 0) return state;
      return { scene: setMaterial(state.scene, id, clean) };
    }),
  previewNodeColor: (id, color) =>
    set((state) => {
      const node = state.scene.nodes[id];
      const clean = normalizeHexColor(color);
      if (
        !state.pendingEdit ||
        !node ||
        clean === null ||
        isEffectivelyLocked(state.scene, id)
      ) {
        return state;
      }
      return { scene: updateNode(state.scene, id, { color: clean }) };
    }),
  setNodeColor: (id, color) => {
    const clean = normalizeHexColor(color);
    if (
      clean === null ||
      isEffectivelyLocked(useSceneStore.getState().scene, id)
    ) {
      return null;
    }
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
    if (
      clean === null ||
      isEffectivelyLocked(useSceneStore.getState().scene, id)
    ) {
      return null;
    }
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
  sceneEpoch: 0,
  applyRemoteScene: (scene) =>
    set((state) => ({
      scene,
      selectedIds: resolveSelection(scene, state.selectedIds),
    })),
  loadScene: (scene) =>
    set((state) => ({
      scene,
      selectedIds: [],
      history: createHistory<Snapshot>(),
      pendingEdit: null,
      sceneEpoch: state.sceneEpoch + 1,
    })),
  restoreScene: (parked) =>
    set((state) => ({
      sceneEpoch: state.sceneEpoch + 1,
      scene: parked.scene,
      selectedIds: parked.selectedIds,
      history: parked.history,
      pendingEdit: null,
      clipboard:
        state.clipboard?.mode === "cut"
          ? { ...state.clipboard, mode: "copy" }
          : state.clipboard,
    })),
  beginEdit: (label) =>
    set((state) => ({
      pendingEdit: {
        before: { scene: state.scene, selectedIds: state.selectedIds },
        label,
      },
    })),
  previewNodeTransform: (id, transform) =>
    set((state) => {
      if (
        !state.pendingEdit ||
        !state.scene.nodes[id] ||
        isEffectivelyLocked(state.scene, id)
      ) {
        return state;
      }
      return { scene: setTransforms(state.scene, { [id]: transform }) };
    }),
  endEdit: (keep) =>
    set((state) => {
      const pending = state.pendingEdit;
      if (!pending) return state;
      if (!keep) return { scene: pending.before.scene, pendingEdit: null };
      // Nothing previewed: no undo step
      if (state.scene === pending.before.scene) return { pendingEdit: null };
      return {
        pendingEdit: null,
        history: recordChange(state.history, {
          state: pending.before,
          label: pending.label,
        }),
      };
    }),
  undo: () =>
    set((state) => {
      // Not while an edit is still in progress (a drag): its end would record from the wrong state
      if (state.pendingEdit) return state;
      // Online, only this person's own changes are taken back, not other people's (see collabHistory.ts)
      if (useCollabStore.getState().active) return undoOnline(state);
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
      if (state.pendingEdit) return state;
      if (useCollabStore.getState().active) return redoOnline(state);
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
