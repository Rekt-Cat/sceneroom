import * as Y from "yjs";
import {
  LOCAL_ORIGIN,
  applySceneChange,
  plainEqual,
  readSceneFromDoc,
  writeSceneToDoc,
  type Scene,
  type SceneNode,
  type SceneDocIssue,
} from "@sceneroom/shared";

/**
 * Keeps one scene of the editor and one shared Yjs document in step (design: docs/backend/COLLABORATION.md,
 * section 5). It knows nothing about the store, the network or React: the caller tells it about changes in the
 * editor (`localChanged`) and gives it a function that puts a scene from the document into the editor
 * (`applyRemote`). That is what makes it testable with two plain documents.
 *
 * - editor to document: a change is compared with what the document holds, only the difference is written, in one
 *   transaction marked as local. Several changes in a short time (a drag) are written together.
 * - document to editor: a change that came from somewhere else is read back, checked with the Zod schemas, and handed
 *   to `applyRemote`. Our own writes are skipped by their mark, so nothing echoes.
 * - the first time: if the document already has a scene (from the network or from the offline copy) the editor
 *   takes it; if the server says the document is empty, the editor's scene is written into it.
 */
export type SceneBindingOptions = {
  doc: Y.Doc;
  /** Puts a scene that came from the document into the editor, without an undo step. */
  applyRemote: (scene: Scene) => void;
  /** Called with what was refused when reading the document (for the log). */
  onIssues?: (issues: SceneDocIssue[]) => void;
  /** Tells how the first meeting of editor and document went. */
  onReconciled?: (how: "seeded" | "adopted") => void;
  /**
   * True when the server let this connection in as a viewer. Its changes are not accepted, so a change made in the editor is
   * put back to what the document holds instead of being written.
   */
  isReadOnly?: () => boolean;
  /** Changes made within this many ms are written together. Default 50. */
  delayMs?: number;
};

export type SceneBinding = {
  /** The editor's scene when the binding starts (the offline copy has been loaded by now). */
  start: (scene: Scene) => void;
  /** The server has answered: its version of the document has arrived. */
  serverSynced: () => void;
  /** The editor's scene changed. */
  localChanged: (scene: Scene) => void;
  isReconciled: () => boolean;
  /** Writes what is waiting right now (the page is being left). */
  flush: () => void;
  /** Writes what is still waiting and lets go of the document. */
  destroy: () => void;
};

/** A note in the document that a scene was put there, so an emptied scene is not mistaken for a new document. */
const META = "meta";
const SEEDED = "seeded";

function hasBeenSeeded(doc: Y.Doc): boolean {
  return doc.getMap(META).has(SEEDED) || doc.getMap("nodes").size > 0;
}

/**
 * A changed object with every field that did not change taken from the old one. What the 3D view builds from a field
 * (a shape from `modifiers`, a plant from `plant`, a character from `character`) is then not built again just
 * because the object was moved by someone else.
 */
function shareFields(old: SceneNode, incoming: SceneNode): SceneNode {
  const node: Record<string, unknown> = { ...incoming };
  for (const key of Object.keys(node)) {
    const before = (old as unknown as Record<string, unknown>)[key];
    if (plainEqual(before, node[key])) node[key] = before;
  }
  return node as SceneNode;
}

/**
 * `incoming` with every part that is the same in `current` replaced by the one from `current`, so the editor
 * redraws only what changed (and `current` itself if nothing did).
 */
export function shareUnchanged(current: Scene, incoming: Scene): Scene {
  const nodes: Scene["nodes"] = {};
  let nodesSame =
    Object.keys(current.nodes).length === Object.keys(incoming.nodes).length;
  for (const [id, node] of Object.entries(incoming.nodes)) {
    const old = current.nodes[id];
    if (old && plainEqual(old, node)) {
      nodes[id] = old;
    } else {
      nodes[id] = old ? shareFields(old, node) : node;
      nodesSame = false;
    }
  }
  const assets: Scene["assets"] = {};
  let assetsSame =
    Object.keys(current.assets).length === Object.keys(incoming.assets).length;
  for (const [id, info] of Object.entries(incoming.assets)) {
    const old = current.assets[id];
    if (old && plainEqual(old, info)) {
      assets[id] = old;
    } else {
      assets[id] = info;
      assetsSame = false;
    }
  }
  const environment = plainEqual(current.environment, incoming.environment)
    ? current.environment
    : incoming.environment;
  if (nodesSame && assetsSame && environment === current.environment) {
    return current;
  }
  return {
    ...incoming,
    nodes: nodesSame ? current.nodes : nodes,
    assets: assetsSame ? current.assets : assets,
    environment,
  };
}

export function createSceneBinding(options: SceneBindingOptions): SceneBinding {
  const { doc } = options;
  const delayMs = options.delayMs ?? 50;

  /** The editor's latest scene. */
  let local: Scene | null = null;
  /** The scene the document holds, as far as we know. null until the first meeting. */
  let known: Scene | null = null;
  let serverIsSynced = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  function flush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!known || !local || local === known) return;
    applySceneChange(doc, known, local, LOCAL_ORIGIN);
    known = local;
  }

  /** The document changed because of someone else: bring the editor up to date. */
  function pull(): void {
    if (!known || !local) return;
    // Our own waiting changes go into the document first, so the merged result contains them
    flush();
    const { scene, issues } = readSceneFromDoc(doc);
    if (issues.length > 0) options.onIssues?.(issues);
    const merged = shareUnchanged(local, scene);
    known = merged;
    if (merged !== local) {
      local = merged;
      options.applyRemote(merged);
    }
  }

  function tryReconcile(): void {
    if (known || !local || destroyed) return;
    if (hasBeenSeeded(doc)) {
      // The shared copy wins the first time (see docs/backend/COLLABORATION.md)
      const { scene, issues } = readSceneFromDoc(doc);
      if (issues.length > 0) options.onIssues?.(issues);
      const merged = shareUnchanged(local, scene);
      known = merged;
      if (merged !== local) {
        local = merged;
        options.applyRemote(merged);
      }
      options.onReconciled?.("adopted");
    } else if (serverIsSynced) {
      // The server has the document and it is empty: this editor's scene is the first
      doc.transact(() => {
        writeSceneToDoc(doc, local!, LOCAL_ORIGIN);
        doc.getMap(META).set(SEEDED, true);
      }, LOCAL_ORIGIN);
      known = local;
      options.onReconciled?.("seeded");
    }
  }

  const onTransaction = (transaction: Y.Transaction) => {
    if (destroyed || !known) return;
    if (transaction.origin === LOCAL_ORIGIN) return;
    if (transaction.changed.size === 0) return;
    pull();
  };
  doc.on("afterTransaction", onTransaction);

  return {
    start(scene) {
      local = scene;
      tryReconcile();
    },
    serverSynced() {
      serverIsSynced = true;
      tryReconcile();
    },
    localChanged(scene) {
      local = scene;
      if (!known || destroyed || scene === known) return;
      if (options.isReadOnly?.()) {
        // A viewer cannot change the scene: put back what the document holds
        local = known;
        options.applyRemote(known);
        return;
      }
      if (timer === null) timer = setTimeout(flush, delayMs);
    },
    isReconciled: () => known !== null,
    flush,
    destroy() {
      if (destroyed) return;
      flush();
      destroyed = true;
      doc.off("afterTransaction", onTransaction);
    },
  };
}
