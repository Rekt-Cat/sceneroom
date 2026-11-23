import { useProjectStore } from "@/store/projectStore";
import { usePersistenceStore } from "@/store/persistenceStore";
import { useSceneStore } from "@/store/sceneStore";
import { useCollabStore } from "./collabStore";
import { createSceneSession, type SceneSession } from "./collabSession";

/**
 * Goes online with the project: whichever scene is open is shared through its own document, and the sharing moves
 * along when another scene tab is opened. Waits until the project has been restored from this browser, because
 * sharing the starting scene (one cube) instead of the real one would put the wrong scene in the document.
 * Returns a function that goes offline again.
 *
 * Only the open scene's contents are shared for now. The list of scenes, scene names and prefabs are not (a later
 * step: the project document, see docs/backend/COLLABORATION.md).
 */
export function startCollab(options: {
  projectId: string;
  url: string;
  token: string;
}): () => void {
  const { setStatus } = useCollabStore.getState();
  let session: SceneSession | null = null;
  let stopped = false;
  let rebindQueued = false;
  let stopStoreWatch: (() => void) | null = null;

  const bind = () => {
    session?.destroy();
    session = createSceneSession({
      projectId: options.projectId,
      sceneId: useProjectStore.getState().activeSceneId,
      url: options.url,
      token: options.token,
      scene: useSceneStore.getState().scene,
      applyRemote: (scene) => useSceneStore.getState().applyRemoteScene(scene),
    });
  };

  const begin = () => {
    setStatus("connecting");
    bind();
    stopStoreWatch = useSceneStore.subscribe((state, previous) => {
      if (state.sceneEpoch !== previous.sceneEpoch) {
        // Another scene was put in the editor (a tab switch). The old one is saved to its document now; the new one is
        // bound once the project store has finished updating (which tab is open is set just after the scene).
        session?.destroy();
        session = null;
        if (!rebindQueued) {
          rebindQueued = true;
          queueMicrotask(() => {
            rebindQueued = false;
            if (!stopped) bind();
          });
        }
        return;
      }
      if (state.scene !== previous.scene) session?.localChanged(state.scene);
    });
  };

  // Leaving the page (closing, reloading, switching tab away): write what is waiting, so the browser's copy of the
  // document is not behind the project that is saved at the same moment
  const flush = () => session?.flush();
  const onHidden = () => {
    if (document.visibilityState === "hidden") flush();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onHidden);

  const isRestored = (status: string) =>
    status === "saved" || status === "saving";
  let stopWaiting: (() => void) | null = null;
  if (isRestored(usePersistenceStore.getState().status)) {
    begin();
  } else {
    setStatus("connecting");
    stopWaiting = usePersistenceStore.subscribe((state) => {
      if (!isRestored(state.status)) return;
      stopWaiting?.();
      stopWaiting = null;
      if (!stopped) begin();
    });
  }

  return () => {
    stopped = true;
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onHidden);
    stopWaiting?.();
    stopStoreWatch?.();
    session?.destroy();
    session = null;
    setStatus("off");
  };
}
