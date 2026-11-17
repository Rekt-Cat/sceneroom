import { setAssetStorage } from "@/assets/assetStorage";
import { useImportStore } from "@/store/importStore";
import { usePersistenceStore } from "@/store/persistenceStore";
import { applyAllPrefabScenes } from "@/store/libraryActions";
import { getProject, useProjectStore } from "@/store/projectStore";
import { useSceneStore } from "@/store/sceneStore";
import { IndexedDbAssetStorage } from "./assetStorageIdb";
import { createAutosave, type Autosave } from "./autosave";
import { describeStorageError, openDatabase } from "./idb";
import { captureThumbnail } from "@/components/viewport/thumbnail";
import { IndexedDbProjectLibrary } from "./projectLibrary";

/** The project being worked on, so "go back to the projects" can save it and take its picture first. */
let session: {
  id: string;
  library: IndexedDbProjectLibrary;
  autosave: Autosave;
} | null = null;

/** A picture is taken at most this often while editing (it costs one extra draw of the 3D view). */
export const THUMBNAIL_EVERY_MS = 30_000;
/** The first picture of a project is taken this long after it opens. */
export const FIRST_THUMBNAIL_AFTER_MS = 4_000;

/** Takes the picture of the open project and keeps it with the project. Nothing happens if there is nothing to take. */
async function storeThumbnail(
  library: IndexedDbProjectLibrary,
  id: string,
): Promise<void> {
  const picture = captureThumbnail();
  if (picture) await library.setThumbnail(id, picture);
}

/**
 * Saves the open project and its picture right now (for leaving the editor). Resolves when it is written; a
 * failure is logged and the caller goes on (the autosave status already tells the person).
 */
export async function saveOpenProjectNow(): Promise<void> {
  if (!session) return;
  const { id, library, autosave } = session;
  try {
    await autosave.flush();
    await storeThumbnail(library, id);
  } catch (error) {
    console.error("Could not save the project before leaving:", error);
  }
}

/**
 * Turns on saving for this page: opens the browser's storage, restores the project with this id (the one in the
 * address), then saves every change a moment after it happens. Returns a function that turns it off again.
 *
 * Saving only starts AFTER the restore has finished. Otherwise the starting scene (one cube) could be
 * saved over the real one before it was read. If the saved project cannot be READ (as opposed to being
 * unreadable data), saving stays off, for the same reason.
 */
export function startPersistence(projectId: string): () => void {
  const setStatus = usePersistenceStore.getState().setStatus;
  const tell = useImportStore.getState().setMessage;

  let stopped = false;
  let database: IDBDatabase | null = null;
  let autosave: Autosave | null = null;
  let unsubscribe: (() => void) | null = null;
  let lastPicture = 0;
  let firstPicture: ReturnType<typeof setTimeout> | null = null;

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
    const library = new IndexedDbProjectLibrary(database);

    try {
      const result = await library.load(projectId);
      if (stopped) return;
      if (result.status === "loaded") {
        useProjectStore.getState().loadProject(result.project);
        // A prefab scene whose last change was not applied before the page closed is applied now
        applyAllPrefabScenes();
      } else if (result.status === "empty") {
        // No such project (a wrong or old link, or one that was deleted): the page says so, nothing is saved
        setStatus("missing");
        return;
      } else if (result.status === "invalid") {
        tell({
          tone: "error",
          text: `This project could not be read (${result.reason}), so saving is turned off to protect it. The data is kept as a backup in this browser.`,
        });
        setStatus("error");
        return;
      }
    } catch (error) {
      console.error("Could not read the saved scene:", error);
      if (stopped) return;
      setStatus("error");
      tell({
        tone: "error",
        text: "The saved project could not be read from the browser storage, so saving is turned off to protect it. Reload the page to try again.",
      });
      return;
    }

    autosave = createAutosave({
      getData: getProject,
      save: (project) => library.save(projectId, project),
      onStatus: (status, error) => {
        setStatus(status);
        if (
          status === "saved" &&
          Date.now() - lastPicture >= THUMBNAIL_EVERY_MS
        ) {
          lastPicture = Date.now();
          void storeThumbnail(library, projectId).catch((e) =>
            console.warn("Could not keep the picture of the project:", e),
          );
        }
        if (status === "error") {
          console.error("Could not save the project:", error);
          tell({
            tone: "error",
            text: `${describeStorageError(error)} The latest changes are not saved yet; saving is retried when you change something.`,
          });
        }
      },
    });
    // Only changes to the project are saved: the open scene, and the list of scenes and which is open
    // (not selecting things, the gizmo mode and so on)
    const stopScene = useSceneStore.subscribe((state, previous) => {
      if (state.scene !== previous.scene) autosave?.markChanged();
    });
    const stopProject = useProjectStore.subscribe(() =>
      autosave?.markChanged(),
    );
    unsubscribe = () => {
      stopScene();
      stopProject();
    };
    session = { id: projectId, library, autosave };
    // A first picture soon after opening, so a project that is only looked at (no change to save) still gets a card
    // picture. The wait gives the 3D view time to draw what the project contains.
    firstPicture = setTimeout(() => {
      if (lastPicture !== 0) return;
      lastPicture = Date.now();
      void storeThumbnail(library, projectId).catch((e) =>
        console.warn("Could not keep the picture of the project:", e),
      );
    }, FIRST_THUMBNAIL_AFTER_MS);
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
    if (firstPicture) clearTimeout(firstPicture);
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("beforeunload", onBeforeUnload);
    unsubscribe?.();
    const last = autosave;
    const db = database;
    if (session?.autosave === last) session = null;
    // What is still waiting is written before the storage is closed (leaving the editor must not lose a change)
    if (last) {
      void last.flush().finally(() => {
        last.stop();
        db?.close();
      });
    } else {
      db?.close();
    }
  };
}
