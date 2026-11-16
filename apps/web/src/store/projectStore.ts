import { create } from "zustand";
import {
  SCENE_TEMPLATE_INFO,
  addProjectScene,
  addProjectScenes,
  availableSceneName,
  createHistory,
  createTemplateScene,
  deleteProjectScene,
  moveProjectScene,
  renameProjectScene,
  whyCannotAddScene,
  DEFAULT_PROJECT_NAME,
  type Prefab,
  type Project,
  type ProjectScene,
  type SceneTemplateName,
} from "@sceneroom/shared";
import { useEditStore } from "./editStore";
import { useSceneStore, type ParkedScene } from "./sceneStore";

/** The name and id of a scene, as shown on its tab. */
/** `prefabId` is set for a scene that exists to edit that prefab. */
export type SceneTab = { id: string; name: string; prefabId?: string };

/**
 * The project: which scenes there are, in what order, and which one is open. The OPEN scene lives in
 * the scene store (so everything that edits a scene works as before). The other scenes are "parked" here,
 * each with its own selection and undo history, and come back exactly as they were left.
 *
 * Project-level changes (new, rename, duplicate, delete, move) are not undoable; deleting asks first.
 */
type ProjectState = {
  name: string;
  scenes: SceneTab[];
  activeSceneId: string;
  /** Every scene except the open one. */
  parked: Record<string, ParkedScene>;
  /** The project's prefabs, by id (shown in the Assets tab, usable in every scene). */
  prefabs: Record<string, Prefab>;
  /** Opens another scene. */
  switchScene: (id: string) => void;
  /** Adds a scene made from a template and opens it. Returns an error sentence, or null if it worked. */
  addScene: (template: SceneTemplateName) => string | null;
  /**
   * Adds scenes that came from a file (new ids, unique names) and opens the first. The prefabs they use come
   * along (a prefab the project already has is kept as it is). Returns an error sentence, or null.
   */
  addScenes: (
    scenes: readonly ProjectScene[],
    prefabs?: Readonly<Record<string, Prefab>>,
  ) => string | null;
  /** Adds a scene that edits a prefab (its contents are the prefab) and opens it. Returns an error sentence, or null. */
  addPrefabScene: (
    prefabId: string,
    name: string,
    scene: ProjectScene["scene"],
  ) => string | null;
  /** Copies a scene (and opens the copy). Returns an error sentence, or null. */
  duplicateScene: (id: string) => string | null;
  /** Returns an error sentence if the name is empty or already used, otherwise null. */
  renameScene: (id: string, name: string) => string | null;
  /** The last scene cannot be deleted. The caller has already asked the user. */
  deleteScene: (id: string) => string | null;
  /** Moves a scene to a new place in the tab order. */
  moveScene: (id: string, toIndex: number) => void;
  /** Replaces the whole project (what was saved in the browser). Clears every undo history. */
  loadProject: (project: Project) => void;
};

/** The part of a project scene that a tab shows. */
function tabOf({ id, name, prefabId }: ProjectScene): SceneTab {
  return prefabId ? { id, name, prefabId } : { id, name };
}

/** Where the open scene's data is, as one parked-scene record. */
function liveScene(): ParkedScene {
  const { scene, selectedIds, history } = useSceneStore.getState();
  return { scene, selectedIds, history };
}

/** The whole project as plain data (for saving): every scene's contents, the open one read from the scene store. */
export function getProject(): Project {
  const { name, scenes, activeSceneId, parked, prefabs } =
    useProjectStore.getState();
  const live = liveScene();
  return {
    version: 1,
    name,
    prefabs,
    activeSceneId,
    scenes: scenes.map((tab) => ({
      id: tab.id,
      name: tab.name,
      scene: (tab.id === activeSceneId ? live : parked[tab.id]!).scene,
      ...(tab.prefabId ? { prefabId: tab.prefabId } : {}),
    })),
  };
}

/** How many objects a scene has (the open scene is read from the editor, the others from parking). */
export function sceneObjectCount(id: string): number {
  const { activeSceneId, parked } = useProjectStore.getState();
  const scene =
    id === activeSceneId ? useSceneStore.getState().scene : parked[id]?.scene;
  return scene ? Object.keys(scene.nodes).length : 0;
}

export const useProjectStore = create<ProjectState>()((set, get) => {
  /**
   * Makes the store match `next` (a project built from getProject() and changed by a pure function).
   * Scenes that were there keep their selection and history; the open scene is swapped when it changed.
   */
  function apply(next: Project) {
    const state = get();
    const known: Record<string, ParkedScene> = {
      ...state.parked,
      [state.activeSceneId]: liveScene(),
    };
    const all: Record<string, ParkedScene> = {};
    for (const scene of next.scenes) {
      all[scene.id] = known[scene.id] ?? {
        scene: scene.scene,
        selectedIds: [],
        history: createHistory(),
      };
    }

    if (next.activeSceneId !== state.activeSceneId) {
      // Finish a drag in progress, and leave edit mode (it belongs to an object of the scene being left)
      useSceneStore.getState().endEdit(true);
      useEditStore.getState().exit();
      useSceneStore.getState().restoreScene(all[next.activeSceneId]!);
    }

    const parked = Object.fromEntries(
      Object.entries(all).filter(([id]) => id !== next.activeSceneId),
    );
    set({
      scenes: next.scenes.map(tabOf),
      activeSceneId: next.activeSceneId,
      parked,
      prefabs: next.prefabs,
    });
  }

  return {
    name: DEFAULT_PROJECT_NAME,
    scenes: [{ id: "scene-1", name: "Scene 1" }],
    activeSceneId: "scene-1",
    parked: {},
    prefabs: {},

    switchScene: (id) => {
      const state = get();
      if (
        id === state.activeSceneId ||
        !state.scenes.some((s) => s.id === id)
      ) {
        return;
      }
      apply({ ...getProject(), activeSceneId: id });
    },

    addScene: (template) => {
      const project = getProject();
      const blocked = whyCannotAddScene(project);
      if (blocked) return blocked;
      const id = crypto.randomUUID();
      const scene = createTemplateScene(template, () => crypto.randomUUID());
      const name = availableSceneName(
        project.scenes,
        SCENE_TEMPLATE_INFO[template].label,
      );
      apply({
        ...addProjectScene(project, { id, name, scene }),
        activeSceneId: id,
      });
      return null;
    },

    addScenes: (scenes, prefabs = {}) => {
      if (scenes.length === 0) return null;
      try {
        const current = getProject();
        const { project, addedIds } = addProjectScenes(current, scenes, () =>
          crypto.randomUUID(),
        );
        apply({
          ...project,
          // A prefab the project already has wins (the same id means the same prefab)
          prefabs: { ...prefabs, ...current.prefabs },
          activeSceneId: addedIds[0]!,
        });
        return null;
      } catch (error) {
        return error instanceof Error
          ? error.message
          : "The scenes could not be added.";
      }
    },

    addPrefabScene: (prefabId, name, scene) => {
      const project = getProject();
      const blocked = whyCannotAddScene(project);
      if (blocked) return blocked;
      const id = crypto.randomUUID();
      apply({
        ...addProjectScene(project, { id, name, scene, prefabId }),
        activeSceneId: id,
      });
      return null;
    },

    duplicateScene: (id) => {
      const project = getProject();
      const source = project.scenes.find((s) => s.id === id);
      if (!source) return "That scene no longer exists.";
      const blocked = whyCannotAddScene(project);
      if (blocked) return blocked;
      const copyId = crypto.randomUUID();
      // Scenes are plain data that is never changed in place, so the copy can share the source's contents
      apply({
        ...addProjectScene(project, {
          id: copyId,
          name: source.name,
          scene: source.scene,
        }),
        activeSceneId: copyId,
      });
      return null;
    },

    renameScene: (id, name) => {
      const next = renameProjectScene(getProject(), id, name);
      if (!next) {
        return name.trim() === ""
          ? "A scene needs a name."
          : "Another scene already has that name.";
      }
      apply(next);
      return null;
    },

    deleteScene: (id) => {
      const project = getProject();
      if (project.scenes.length <= 1) {
        return "A project needs at least one scene, so the last one cannot be deleted.";
      }
      apply(deleteProjectScene(project, id));
      return null;
    },

    moveScene: (id, toIndex) =>
      apply(moveProjectScene(getProject(), id, toIndex)),

    loadProject: (project) => {
      const active = project.scenes.find(
        (s) => s.id === project.activeSceneId,
      )!;
      useSceneStore.getState().endEdit(true);
      useEditStore.getState().exit();
      useSceneStore.getState().loadScene(active.scene);
      const parked: Record<string, ParkedScene> = {};
      for (const scene of project.scenes) {
        if (scene.id === active.id) continue;
        parked[scene.id] = {
          scene: scene.scene,
          selectedIds: [],
          history: createHistory(),
        };
      }
      set({
        name: project.name,
        scenes: project.scenes.map(tabOf),
        activeSceneId: project.activeSceneId,
        parked,
        prefabs: project.prefabs,
      });
    },
  };
});
