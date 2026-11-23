import { getAssetStorage, setAssetStorage } from "@/assets/assetStorage";
import { bytesForFile } from "@/assets/meshStorage";
import { useProjectStore } from "@/store/projectStore";
import { usePersistenceStore } from "@/store/persistenceStore";
import { useSceneStore } from "@/store/sceneStore";
import { useCollabStore } from "./collabStore";
import { createSceneSession, type SceneSession } from "./collabSession";
import { createFileClient } from "./fileClient";
import { createFileUploader, type FileUploader } from "./fileUploader";
import { OnlineAssetStorage } from "./onlineAssetStorage";

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
  let stopStatusWatch: (() => void) | null = null;
  let uploader: FileUploader | null = null;
  let putStorageBack: (() => void) | null = null;

  /** The files the open scene refers to are sent to the server (the ones it does not have yet). */
  const requestUpload = () =>
    uploader?.request(Object.keys(useSceneStore.getState().scene.assets));

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
    // Files: ones that come with other people's changes are downloaded when asked for; the ones this scene refers to are
    // sent. Done after the project is restored, so the storage being wrapped is the browser's own (see assetStorage.ts).
    const ownStorage = getAssetStorage();
    const files = createFileClient({
      url: options.url,
      projectId: options.projectId,
      token: options.token,
    });
    setAssetStorage(new OnlineAssetStorage(ownStorage, files));
    putStorageBack = () => setAssetStorage(ownStorage);
    uploader = createFileUploader({
      client: files,
      storage: ownStorage,
      prepare: bytesForFile,
    });
    // Again whenever the connection comes back: files may have been made while it was down
    stopStatusWatch = useCollabStore.subscribe((state, previous) => {
      if (state.status === "online" && previous.status !== "online") {
        requestUpload();
      }
    });
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
      if (state.scene.assets !== previous.scene.assets) requestUpload();
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
    stopStatusWatch?.();
    uploader?.destroy();
    putStorageBack?.();
    session?.destroy();
    session = null;
    setStatus("off");
  };
}
