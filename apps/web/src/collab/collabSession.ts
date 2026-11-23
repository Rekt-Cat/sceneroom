import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import type { Scene } from "@sceneroom/shared";
import type { AwarenessLike } from "./editLocks";
import { createSceneBinding } from "./sceneBinding";
import { useCollabStore } from "./collabStore";

export type SceneSessionOptions = {
  projectId: string;
  sceneId: string;
  url: string;
  token: string;
  /** The editor's scene right now. */
  scene: Scene;
  applyRemote: (scene: Scene) => void;
};

/** One scene shared online: its document, its offline copy in this browser, its connection and its binding. */
export type SceneSession = {
  /** Who is here and what they are doing (not saved; gone when the connection is). null if the connection has none. */
  awareness: AwarenessLike | null;
  localChanged: (scene: Scene) => void;
  /** Writes the changes still waiting into the document (and so into the browser's copy of it). */
  flush: () => void;
  destroy: () => void;
};

/** The name of a scene's document; the server accepts exactly this shape (apps/collab-server/src/documentName.ts). */
export function sceneDocumentName(projectId: string, sceneId: string): string {
  return `scene:${projectId}:${sceneId}`;
}

/**
 * Shares one scene: the document is kept in this browser (so work survives a reload or a lost connection), connected
 * to the server, and bound to the editor's scene.
 */
export function createSceneSession(options: SceneSessionOptions): SceneSession {
  const name = sceneDocumentName(options.projectId, options.sceneId);
  const setStatus = useCollabStore.getState().setStatus;
  const doc = new Y.Doc();
  let destroyed = false;

  const binding = createSceneBinding({
    doc,
    applyRemote: options.applyRemote,
    isReadOnly: () => useCollabStore.getState().readOnly,
    onIssues: (issues) => {
      for (const issue of issues) {
        console.warn(
          `Refused data from the shared document: ${issue.where}: ${issue.message}`,
        );
      }
    },
  });

  const offlineCopy = new IndexeddbPersistence(`sceneroom-collab:${name}`, doc);
  const provider = new HocuspocusProvider({
    url: options.url,
    name,
    document: doc,
    token: options.token,
    onStatus: ({ status }) => {
      if (destroyed) return;
      if (status === "connected") setStatus("online");
      else if (status === "connecting") setStatus("connecting");
      else setStatus("offline");
    },
    onSynced: ({ state }) => {
      if (state && !destroyed) binding.serverSynced();
    },
    onAuthenticated: ({ scope }) => {
      if (!destroyed)
        useCollabStore.getState().setReadOnly(scope === "readonly");
    },
    onAuthenticationFailed: ({ reason }) => {
      if (destroyed) return;
      console.warn(`The server did not accept the link: ${reason}`);
      setStatus(
        "refused",
        "The server did not accept this link. It may be wrong or expired.",
      );
    },
  });

  // The offline copy is loaded into the document first; then the editor's scene meets it
  void offlineCopy.whenSynced.then(() => {
    if (!destroyed) binding.start(options.scene);
  });

  return {
    awareness: provider.awareness,
    localChanged: binding.localChanged,
    flush: binding.flush,
    destroy() {
      if (destroyed) return;
      binding.destroy();
      destroyed = true;
      provider.destroy();
      void offlineCopy.destroy();
      doc.destroy();
    },
  };
}
