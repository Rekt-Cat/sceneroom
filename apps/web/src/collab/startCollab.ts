import { getAssetStorage, setAssetStorage } from "@/assets/assetStorage";
import { bytesForFile } from "@/assets/meshStorage";
import { useBakeStore } from "@/store/bakeStore";
import { useEditStore } from "@/store/editStore";
import { useImportStore } from "@/store/importStore";
import { usePaintStore } from "@/store/paintStore";
import { useProjectStore } from "@/store/projectStore";
import { usePersistenceStore } from "@/store/persistenceStore";
import { useSceneStore } from "@/store/sceneStore";
import { useCollabStore } from "./collabStore";
import { setCursorSender } from "./activePresence";
import { watchHistory } from "./collabHistory";
import { loadSavedName } from "./identity";
import { HOLD_IDLE_MS, createObjectHolds, type Holder } from "./objectHolds";
import { cleanName, createPresence, defaultName } from "./presence";
import {
  createEditLocks,
  EDIT_MODE_VERB,
  type EditingState,
} from "./editLocks";
import { createSceneSession, type SceneSession } from "./collabSession";
import { createFileClient } from "./fileClient";
import { createFileUploader, type FileUploader } from "./fileUploader";
import { OnlineAssetStorage } from "./onlineAssetStorage";
import { asTokenSource, type TokenSource } from "./tokenSource";

/** The idle time in whole seconds, for the message. */
const HOLD_IDLE_SECONDS = Math.round(HOLD_IDLE_MS / 1000);

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
  token: string | TokenSource;
}): () => void {
  const token = asTokenSource(options.token);
  const { setStatus } = useCollabStore.getState();
  let session: SceneSession | null = null;
  let stopped = false;
  let rebindQueued = false;
  let stopStoreWatch: (() => void) | null = null;
  let stopStatusWatch: (() => void) | null = null;
  let stopHistoryWatch: (() => void) | null = null;
  let locks: ReturnType<typeof createEditLocks> | null = null;
  let presence: ReturnType<typeof createPresence> | null = null;
  let holds: ReturnType<typeof createObjectHolds> | null = null;
  let stopEditingWatch: (() => void) | null = null;

  /** What this person is doing to an object right now, for the others to see. */
  const currentEditing = (): EditingState => {
    const editing = useEditStore.getState().nodeId;
    if (editing) return { nodeId: editing, mode: "edit" };
    const painting = usePaintStore.getState().nodeId;
    if (painting) return { nodeId: painting, mode: "paint" };
    const baking = useBakeStore.getState().runningFor;
    if (baking) return { nodeId: baking, mode: "bake" };
    return null;
  };

  const releaseLocks = () => {
    stopEditingWatch?.();
    stopEditingWatch = null;
    holds?.destroy();
    holds = null;
    locks?.destroy();
    locks = null;
    setCursorSender(null);
    presence?.destroy();
    presence = null;
  };

  /** The name shown to others: the one this person chose, else a guest name. */
  const shownName = (clientId: number) =>
    cleanName(useCollabStore.getState().myName ?? "") ?? defaultName(clientId);

  /**
   * Starts sharing who is here for the connection of the open scene: name, colour, selection and pointer, and "who is
   * editing what" (the courtesy lock).
   */
  const shareAwareness = (session: SceneSession) => {
    releaseLocks();
    const awareness = session.awareness;
    if (!awareness) return;
    const collab = useCollabStore.getState();
    presence = createPresence({
      awareness,
      name: shownName(awareness.clientID),
      onPeople: (people) => useCollabStore.getState().setPeople(people),
      onCursors: (cursors) => useCollabStore.getState().setCursors(cursors),
    });
    collab.setMe({ clientId: awareness.clientID, color: presence.color });
    const sharing = presence;
    sharing.setSelection(useSceneStore.getState().selectedIds);
    setCursorSender((position) => sharing.setCursor(position));
    // Selection locks: selecting an object holds it for everyone else (objectHolds.ts)
    const keeper = createObjectHolds({
      awareness,
      getTree: () => useSceneStore.getState().scene.nodes,
      getSelection: () => useSceneStore.getState().selectedIds,
      setSelection: (ids) => useSceneStore.getState().setSelection(ids),
      isReadOnly: () => useCollabStore.getState().readOnly,
      onState: ({ holds: held, blocked }) =>
        useCollabStore.getState().setHolds(held, blocked),
      onLost: (ids, holder: Holder) => {
        const name =
          useSceneStore.getState().scene.nodes[ids[0]!]?.name ?? "that object";
        useImportStore.getState().setMessage({
          tone: "info",
          text: `${holder.name} selected "${name}" at the same moment, so you were taken off it.`,
        });
      },
      onIdle: (ids) => {
        const name =
          useSceneStore.getState().scene.nodes[ids[0]!]?.name ?? "the object";
        useImportStore.getState().setMessage({
          tone: "info",
          text: `You were not active for ${HOLD_IDLE_SECONDS} seconds, so "${name}" was let go for others. Click it to take it again.`,
        });
      },
    });
    holds = keeper;
    // Any key or mouse button counts as activity (orbiting the camera or typing a value keeps the hold)
    let lastActivity = 0;
    const active = (event: Event) => {
      if (event.type === "pointermove" && (event as PointerEvent).buttons === 0)
        return;
      const now = Date.now();
      if (now - lastActivity < 500) return;
      lastActivity = now;
      keeper.activity();
    };
    const activityEvents = [
      "pointerdown",
      "pointermove",
      "keydown",
      "wheel",
    ] as const;
    activityEvents.forEach((name) =>
      window.addEventListener(name, active, { passive: true }),
    );
    const stopWatching = [
      () =>
        activityEvents.forEach((name) =>
          window.removeEventListener(name, active),
        ),
      useSceneStore.subscribe((state, previous) => {
        if (state.selectedIds !== previous.selectedIds) {
          sharing.setSelection(state.selectedIds);
          keeper.selectionChanged();
        }
        if (state.scene.nodes !== previous.scene.nodes) keeper.treeChanged();
      }),
      useCollabStore.subscribe((state, previous) => {
        if (state.status !== previous.status)
          keeper.setConnected(state.status === "online");
        if (state.readOnly !== previous.readOnly) keeper.selectionChanged();
      }),
      useCollabStore.subscribe((state, previous) => {
        if (state.myName !== previous.myName) {
          sharing.setName(shownName(awareness.clientID));
        }
      }),
    ];
    locks = createEditLocks({
      awareness,
      onLocks: (held) => useCollabStore.getState().setLocks(held),
      onLostLock: (mine, holder) => {
        // Two people entered at the same moment; the other one has the lower number and keeps the object
        useImportStore.getState().setMessage({
          tone: "info",
          text: `${holder.name} started ${EDIT_MODE_VERB[holder.mode]} this object at the same moment, so you were taken out of it.`,
        });
        if (mine.mode === "edit") useEditStore.getState().exit();
        if (mine.mode === "paint")
          void import("@/paint/paintSession").then((m) => m.stopPaint());
      },
    });
    locks.setEditing(currentEditing());
    const stops = [
      useEditStore.subscribe(() => locks?.setEditing(currentEditing())),
      usePaintStore.subscribe(() => locks?.setEditing(currentEditing())),
      useBakeStore.subscribe(() => locks?.setEditing(currentEditing())),
    ];
    stopEditingWatch = () => {
      stops.forEach((stop) => stop());
      stopWatching.forEach((stop) => stop());
    };
  };
  let uploader: FileUploader | null = null;
  let putStorageBack: (() => void) | null = null;

  /** The files the open scene refers to are sent to the server (the ones it does not have yet). */
  const requestUpload = () => {
    // A viewer cannot send files (the server would refuse them)
    if (useCollabStore.getState().readOnly) return;
    uploader?.request(Object.keys(useSceneStore.getState().scene.assets));
  };

  const bind = () => {
    session?.destroy();
    session = createSceneSession({
      projectId: options.projectId,
      sceneId: useProjectStore.getState().activeSceneId,
      url: options.url,
      token,
      scene: useSceneStore.getState().scene,
      applyRemote: (scene) => useSceneStore.getState().applyRemoteScene(scene),
    });
    shareAwareness(session);
    requestUpload();
  };

  const begin = () => {
    setStatus("connecting");
    useCollabStore.setState({ myName: loadSavedName() });
    // Files: ones that come with other people's changes are downloaded when asked for; the ones this scene refers to are
    // sent. Done after the project is restored, so the storage being wrapped is the browser's own (see assetStorage.ts).
    const ownStorage = getAssetStorage();
    const files = createFileClient({
      url: options.url,
      projectId: options.projectId,
      token,
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
    // Undo online takes back only this person's changes, which needs the scene after each step (collabHistory.ts)
    stopHistoryWatch = watchHistory((listener) =>
      useSceneStore.subscribe(listener),
    );
    bind();
    stopStoreWatch = useSceneStore.subscribe((state, previous) => {
      if (state.sceneEpoch !== previous.sceneEpoch) {
        // Another scene was put in the editor (a tab switch). The old one is saved to its document now; the new one is
        // bound once the project store has finished updating (which tab is open is set just after the scene).
        session?.destroy();
        session = null;
        releaseLocks();
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
    stopHistoryWatch?.();
    releaseLocks();
    uploader?.destroy();
    putStorageBack?.();
    session?.destroy();
    session = null;
    setStatus("off");
  };
}
