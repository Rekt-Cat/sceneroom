import { setAssetStorage } from "@/assets/assetStorage";
import { useImportStore } from "@/store/importStore";
import { usePersistenceStore } from "@/store/persistenceStore";
import { useSceneStore } from "@/store/sceneStore";
import { IndexedDbAssetStorage } from "./assetStorageIdb";
import { createAutosave, type Autosave } from "./autosave";
import { describeStorageError, openDatabase } from "./idb";
import { IndexedDbSceneRepository } from "./sceneRepository";

/**
 * Turns on saving for this page: opens the browser's storage, restores the scene that was saved last
 * time, then saves every change a moment after it happens. Returns a function that turns it off again.
 *
 * Saving only starts AFTER the restore has finished. Otherwise the starting scene (one cube) could be
 * saved over the real one before it was read. If the saved scene cannot be READ (as opposed to being
 * unreadable data), saving stays off, for the same reason.
 */
export function startPersistence(): () => void {
  const setStatus = usePersistenceStore.getState().setStatus;
  const tell = useImportStore.getState().setMessage;

  let stopped = false;
  let database: IDBDatabase | null = null;
  let autosave: Autosave | null = null;
  let unsubscribe: (() => void) | null = null;

  setStatus("loading");

  void (async () => {
    try {
      database = await openDatabase();
    } catch (error) {
      console.warn("Browser storage is not available:", error);
      if (stopped) return;
      setStatus("unavailable");
      tell({
        tone: "error",
        text: `${describeStorageError(error)} Your scene and imported models will be lost when you close or reload the page.`,
      });
      return;
    }
    if (stopped) {
      database.close();
      return;
    }

    // From here on imported files are kept in the browser's storage and survive a reload
    setAssetStorage(new IndexedDbAssetStorage(database));
    const repository = new IndexedDbSceneRepository(database);

    try {
      const result = await repository.load();
      if (stopped) return;
      if (result.status === "loaded") {
        useSceneStore.getState().loadScene(result.scene);
      } else if (result.status === "invalid") {
        tell({
          tone: "error",
          text: `Your saved scene could not be read (${result.reason}), so a new scene was started. The old data is kept as a backup in this browser.`,
        });
      }
    } catch (error) {
      console.error("Could not read the saved scene:", error);
      if (stopped) return;
      setStatus("error");
      tell({
        tone: "error",
        text: "The saved scene could not be read from the browser storage, so saving is turned off to protect it. Reload the page to try again.",
      });
      return;
    }

    autosave = createAutosave({
      getScene: () => useSceneStore.getState().scene,
      save: (scene) => repository.save(scene),
      onStatus: (status, error) => {
        setStatus(status);
        if (status === "error") {
          console.error("Could not save the scene:", error);
          tell({
            tone: "error",
            text: `${describeStorageError(error)} The latest changes are not saved yet; saving is retried when you change something.`,
          });
        }
      },
    });
    // Only changes to the scene are saved (not selecting things, the gizmo mode and so on)
    unsubscribe = useSceneStore.subscribe((state, previous) => {
      if (state.scene !== previous.scene) autosave?.markChanged();
    });
    setStatus("saved");
  })();

  const flush = () => void autosave?.flush();
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") flush();
  };
  // If something is still unsaved when the page is being left, ask the browser to confirm
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (autosave?.hasUnsavedChanges()) {
      flush();
      event.preventDefault();
    }
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", onBeforeUnload);

  return () => {
    stopped = true;
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("beforeunload", onBeforeUnload);
    unsubscribe?.();
    autosave?.stop();
    database?.close();
  };
}
