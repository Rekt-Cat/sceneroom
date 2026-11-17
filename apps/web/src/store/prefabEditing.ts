import { useImportStore } from "./importStore";
import { applyAllPrefabScenes, applyPrefabScene } from "./libraryActions";
import { getProject, useProjectStore } from "./projectStore";
import { useSceneStore } from "./sceneStore";

/** How long to wait after the last change to a prefab's scene before the copies are rebuilt. */
export const PREFAB_APPLY_DEBOUNCE_MS = 300;

/**
 * Keeps the copies of a prefab in step while the prefab is being edited. A prefab is edited in a scene of
 * its own; a moment after each change in that scene the prefab is read back from it and every copy, in every
 * scene, is rebuilt. Returns a function that stops it.
 */
export function startPrefabEditing(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let editingSceneId: string | null = null;
  /** The last warning shown, so the same one is not repeated on every change. */
  let lastWarning = "";

  function warn(text: string) {
    if (text === lastWarning) return;
    lastWarning = text;
    if (text) useImportStore.getState().setMessage({ tone: "info", text });
  }

  function apply(sceneId: string) {
    const { problem, extra } = applyPrefabScene(sceneId);
    if (problem) return warn(problem);
    warn(
      extra > 0
        ? `Only the prefab's top object and what is inside it belong to the prefab. ${extra} other top-level object${extra === 1 ? " is" : "s are"} ignored: drag ${extra === 1 ? "it" : "them"} onto the top object in the scene list to make ${extra === 1 ? "it" : "them"} part of it.`
        : "",
    );
  }

  const stop = useSceneStore.subscribe((state, previous) => {
    if (state.scene === previous.scene) return;
    const { activeSceneId, scenes } = useProjectStore.getState();
    const tab = scenes.find((s) => s.id === activeSceneId);
    if (!tab?.prefabId) return;
    editingSceneId = tab.id;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (editingSceneId) apply(editingSceneId);
    }, PREFAB_APPLY_DEBOUNCE_MS);
  });

  // Leaving the editing scene applies its last change at once (the debounce would read the right scene
  // anyway, but the copies in the scene being opened must be up to date before it is shown)
  const stopSwitch = useProjectStore.subscribe((state, previous) => {
    if (state.activeSceneId === previous.activeSceneId) return;
    if (timer === null || !editingSceneId) return;
    clearTimeout(timer);
    timer = null;
    // The scene that was being edited is now parked; its latest contents are in the project
    if (getProject().scenes.some((s) => s.id === editingSceneId)) {
      apply(editingSceneId);
    }
  });

  return () => {
    stop();
    stopSwitch();
    if (timer !== null) clearTimeout(timer);
  };
}

/** Applies every prefab scene once, after a project was loaded. */
export { applyAllPrefabScenes };
