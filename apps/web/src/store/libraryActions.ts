import {
  MAX_PREFABS,
  availablePrefabName,
  availableSceneName,
  collectProjectModels,
  createPrefab,
  createPrefabScene,
  normalizeNodeName,
  prefabFromScene,
  prefabInstanceIds,
  prefabRootId,
  removeAsset,
  renameAsset,
  setAssetNote,
  syncPrefabInstances,
  unlinkPrefab,
  samePrefabContent,
  whyCannotMakePrefab,
  type AssetInfo,
  type Prefab,
  type Scene,
} from "@sceneroom/shared";
import { getProject, useProjectStore } from "./projectStore";
import { useSceneStore } from "./sceneStore";

/**
 * The project's library: the imported models and the prefabs, shared by every scene. The open scene is
 * changed through the scene store (so each change is one undo step in that scene); the other scenes are
 * changed directly (their own undo history does not include these project-wide changes).
 */

/** Every scene of the project, the open one first. */
export function allScenes(): Scene[] {
  const { activeSceneId, scenes, parked } = useProjectStore.getState();
  const open = useSceneStore.getState().scene;
  return [
    open,
    ...scenes
      .filter((s) => s.id !== activeSceneId)
      .map((s) => parked[s.id]!.scene),
  ];
}

/** Changes every scene except the open one. */
function changeParked(change: (scene: Scene) => Scene) {
  useProjectStore.setState((state) => ({
    parked: Object.fromEntries(
      Object.entries(state.parked).map(([id, parked]) => {
        const scene = change(parked.scene);
        return [id, scene === parked.scene ? parked : { ...parked, scene }];
      }),
    ),
  }));
}

/** The imported models of the whole project, each once. */
export function projectModels(): AssetInfo[] {
  return collectProjectModels(allScenes());
}

/** Renames an imported model everywhere it is known. */
export function renameModel(assetId: string, name: string) {
  useSceneStore.getState().renameAsset(assetId, name);
  changeParked((scene) => renameAsset(scene, assetId, name));
}

/** Sets the source and licence note of an imported model everywhere it is known. */
export function setModelNote(assetId: string, note: string) {
  useSceneStore.getState().setAssetNote(assetId, note);
  changeParked((scene) => setAssetNote(scene, assetId, note));
}

/** The prefabs that use the model (their inside shows it). */
export function prefabsUsingModel(assetId: string): string[] {
  return Object.values(useProjectStore.getState().prefabs)
    .filter((prefab) => prefab.assets.some((a) => a.id === assetId))
    .map((prefab) => prefab.name);
}

/**
 * Deletes an imported model from the project: the objects that show it are deleted from every scene. Refused
 * while a prefab uses it. Returns a sentence saying why not, or null.
 */
export function deleteModel(assetId: string): string | null {
  const usedBy = prefabsUsingModel(assetId);
  if (usedBy.length > 0) {
    return `It is used inside the prefab ${usedBy.map((n) => `"${n}"`).join(", ")}. Delete the prefab first.`;
  }
  useSceneStore.getState().deleteAsset(assetId);
  changeParked((scene) => removeAsset(scene, assetId).scene);
  return null;
}

/**
 * Puts a model or a prefab from the Assets tab into the open scene (at a spot on the ground, if given) and
 * selects it. A model that this scene has not used yet is added to it. Returns the new object's id, or null
 * if the id is not in the library.
 */
export function placeLibraryItem(
  id: string,
  at?: [number, number, number],
): string | null {
  const prefab = useProjectStore.getState().prefabs[id];
  if (prefab) return useSceneStore.getState().placePrefabInstance(prefab, at);
  const info = projectModels().find((model) => model.id === id);
  if (!info) return null;
  return useSceneStore.getState().placeModel(info, at);
}

/** Whether an id from the Assets tab is a prefab (not a model). */
export function isPrefabId(id: string): boolean {
  return useProjectStore.getState().prefabs[id] !== undefined;
}

/**
 * Makes a prefab from an object of the open scene: it appears in the Assets tab and can be placed in any
 * scene. The object itself becomes a linked copy of it, where it stands. Returns a sentence saying why not,
 * or null.
 */
export function makePrefab(nodeId: string): string | null {
  const scene = useSceneStore.getState().scene;
  const { prefabs } = useProjectStore.getState();
  const blocked = whyCannotMakePrefab(
    scene,
    nodeId,
    Object.keys(prefabs).length,
  );
  if (blocked) return blocked;
  const id = crypto.randomUUID();
  const prefab = createPrefab(scene, nodeId, id);
  if (!prefab) return "A prefab could not be made from this object.";
  const named = {
    ...prefab,
    name: availablePrefabName(prefabs, prefab.name),
  };
  useProjectStore.setState({ prefabs: { ...prefabs, [id]: named } });
  useSceneStore.getState().convertToPrefabInstance(nodeId, named);
  return null;
}

/** The tab of the scene that is editing the prefab, or null if it is not open. */
function prefabSceneId(prefabId: string): string | null {
  return (
    useProjectStore.getState().scenes.find((tab) => tab.prefabId === prefabId)
      ?.id ?? null
  );
}

/**
 * Opens a prefab for editing: a scene whose contents are the prefab appears as a tab. Change it like any
 * scene; every copy of the prefab follows. Opens the tab that is already there if the prefab is open.
 * Returns a sentence saying why not, or null.
 */
export function editPrefab(prefabId: string): string | null {
  const { prefabs } = useProjectStore.getState();
  const prefab = prefabs[prefabId];
  if (!prefab) return "That prefab no longer exists.";
  const existing = prefabSceneId(prefabId);
  if (existing) {
    useProjectStore.getState().switchScene(existing);
    return null;
  }
  const problem = useProjectStore
    .getState()
    .addPrefabScene(
      prefabId,
      availableSceneName(
        useProjectStore.getState().scenes,
        `Prefab: ${prefab.name}`,
      ),
      createPrefabScene(prefab),
    );
  if (problem) return problem;
  // The top object is selected, ready to change
  useSceneStore.getState().select(prefabRootId(prefab));
  return null;
}

/**
 * Reads the prefab back from the scene that edits it and, if it changed, rebuilds every copy in every scene.
 * Called a moment after each change (see prefabEditing.ts) and when the editing scene is closed. Returns a
 * sentence if the scene cannot be a prefab (the top object is gone, a copy of a prefab is inside it), and
 * null otherwise. `extra` lists top-level objects that are not part of the prefab.
 */
export function applyPrefabScene(sceneId: string): {
  problem: string | null;
  extra: number;
} {
  const project = getProject();
  const entry = project.scenes.find((s) => s.id === sceneId);
  const prefab = entry?.prefabId ? project.prefabs[entry.prefabId] : undefined;
  if (!entry || !prefab) return { problem: null, extra: 0 };

  const result = prefabFromScene(entry.scene, prefab);
  if (!result.ok) return { problem: result.reason, extra: 0 };
  const extra = result.extraTopLevel.length;
  if (samePrefabContent(result.prefab, prefab)) return { problem: null, extra };

  useProjectStore.setState({
    prefabs: { ...project.prefabs, [prefab.id]: result.prefab },
  });
  syncCopies(result.prefab, sceneId);
  return { problem: null, extra };
}

/** Rebuilds the copies of the prefab in every scene except the one that edits it. */
function syncCopies(prefab: Prefab, exceptSceneId: string) {
  const { activeSceneId } = useProjectStore.getState();
  if (activeSceneId !== exceptSceneId) {
    useSceneStore.getState().syncPrefab(prefab);
  }
  useProjectStore.setState((state) => ({
    parked: Object.fromEntries(
      Object.entries(state.parked).map(([id, parked]) => {
        if (id === exceptSceneId) return [id, parked];
        const scene = syncPrefabInstances(parked.scene, prefab, () =>
          crypto.randomUUID(),
        );
        return [id, scene === parked.scene ? parked : { ...parked, scene }];
      }),
    ),
  }));
}

/** Applies every open prefab scene (after the project was loaded, in case the last change was not applied). */
export function applyAllPrefabScenes() {
  for (const tab of useProjectStore.getState().scenes) {
    if (tab.prefabId) applyPrefabScene(tab.id);
  }
}

/** Finishes editing a prefab: the last change is applied and the editing scene closes. Returns a sentence if it cannot. */
export function closePrefabScene(sceneId: string): string | null {
  const { problem } = applyPrefabScene(sceneId);
  if (problem) return problem;
  return useProjectStore.getState().deleteScene(sceneId);
}

/** Deletes a prefab from the project; its copies become ordinary objects, and its editing scene closes. */
export function deletePrefab(prefabId: string) {
  const editing = prefabSceneId(prefabId);
  if (editing) useProjectStore.getState().deleteScene(editing);
  useSceneStore.getState().unlinkPrefabEverywhere(prefabId);
  changeParked((scene) => unlinkPrefab(scene, prefabId));
  useProjectStore.setState((state) => ({
    prefabs: Object.fromEntries(
      Object.entries(state.prefabs).filter(([id]) => id !== prefabId),
    ),
  }));
}

/** Renames a prefab. Returns a sentence if the name is not usable, or null. */
export function renamePrefab(prefabId: string, name: string): string | null {
  const clean = normalizeNodeName(name);
  if (clean === null) return "A prefab needs a name.";
  const { prefabs } = useProjectStore.getState();
  const prefab = prefabs[prefabId];
  if (!prefab || prefab.name === clean) return null;
  if (
    Object.values(prefabs).some((p) => p.id !== prefabId && p.name === clean)
  ) {
    return "Another prefab already has that name.";
  }
  useProjectStore.setState({
    prefabs: { ...prefabs, [prefabId]: { ...prefab, name: clean } },
  });
  return null;
}

export { MAX_PREFABS, prefabInstanceIds };
