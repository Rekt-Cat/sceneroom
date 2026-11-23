import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
import { readSceneFromDoc } from "@sceneroom/shared";
import { parseDocumentName } from "./documentName";
import { handleFileRequest } from "./fileRoutes";
import type { FileStore } from "./fileStore";
import { verifyLinkToken, type LinkRole } from "./linkToken";
import type { Logger } from "./logger";
import type { DocumentStore } from "./store";

export type CollabServerOptions = {
  /** 0 = pick a free port (tests). */
  port: number;
  host: string;
  /** The secret the link tokens are signed with. */
  secret: string;
  store: DocumentStore;
  logger: Logger;
  /** The biggest single message a client may send. */
  maxMessageBytes: number;
  /** The biggest a document may be when it is saved. */
  maxDocumentBytes: number;
  /** The big files (models, meshes, pictures), served at /files/<projectId>/<fileId>. */
  files: FileStore;
  /** The biggest single file, in bytes. */
  maxFileBytes: number;
  /** The most bytes all the files of one project may take together. */
  maxProjectFileBytes: number;
  /** Web pages from these origins may call the file routes (CORS). */
  allowedOrigins: readonly string[];
  /** Save a document this long after its last change (ms), and at the latest this long after the first. */
  debounceMs?: number;
  maxDebounceMs?: number;
};

/** What the server remembers about a connection, from the moment its token was checked. */
export type ConnectionContext = { projectId: string; role: LinkRole };

/**
 * Builds the collab server (not started yet; call `listen`). The rules, all enforced here and never left to the client:
 *
 * - a connection must show a valid link token, and the token must be for the project the document belongs to
 * - a "viewer" token gives a read-only connection: the server ignores its changes
 * - documents are named "project:<id>" or "scene:<projectId>:<sceneId>"; any other name is refused
 * - a message bigger than `maxMessageBytes` closes the connection; a document bigger than `maxDocumentBytes` is not saved
 * - documents are loaded from and saved to the store, so they survive a restart
 * - big files go through `/files/<projectId>/<fileId>` (see fileRoutes.ts), checked by the same tokens
 */
export function createCollabServer(options: CollabServerOptions) {
  const { store, logger } = options;
  const server = new Server({
    port: options.port,
    address: options.host,
    quiet: true,
    stopOnSignals: false,
    debounce: options.debounceMs ?? 2000,
    maxDebounce: options.maxDebounceMs ?? 10_000,
    // Applies before anyone has logged in, so a stranger cannot make the server buffer a huge message
    websocketOptions: { maxPayload: options.maxMessageBytes },

    async onAuthenticate({
      documentName,
      token,
      connectionConfig,
    }): Promise<ConnectionContext> {
      const name = parseDocumentName(documentName);
      if (!name) {
        logger.warn(`refused: bad document name "${documentName}"`);
        throw new Error("Unknown document");
      }
      const check = verifyLinkToken(token, options.secret);
      if (!check.ok) {
        logger.warn(`refused ${documentName}: ${check.reason}`);
        throw new Error("Not allowed");
      }
      if (check.projectId !== name.projectId) {
        logger.warn(`refused ${documentName}: token is for another project`);
        throw new Error("Not allowed");
      }
      if (check.role === "viewer") connectionConfig.readOnly = true;
      return { projectId: check.projectId, role: check.role };
    },

    async onLoadDocument({ document, documentName }) {
      const saved = store.load(documentName);
      if (saved) Y.applyUpdate(document, saved);
    },

    async onStoreDocument({ document, documentName }) {
      const state = Y.encodeStateAsUpdate(document);
      if (state.byteLength > options.maxDocumentBytes) {
        // Not saved: the last saved version stays. Loud on purpose, because the changes since then are at risk.
        logger.error(
          `NOT SAVED ${documentName}: ${state.byteLength} bytes is over the limit of ${options.maxDocumentBytes}`,
        );
        return;
      }
      store.save(documentName, state);
      if (parseDocumentName(documentName)?.kind === "scene") {
        const { issues } = readSceneFromDoc(document);
        for (const issue of issues) {
          logger.warn(`${documentName}: ${issue.where}: ${issue.message}`);
        }
      }
    },
  });

  // The file routes answer first; every other request goes to Hocuspocus as before
  const hocuspocusHandler = server.requestHandler;
  server.httpServer.removeAllListeners("request");
  server.httpServer.on("request", (request, response) => {
    void handleFileRequest(request, response, {
      store: options.files,
      secret: options.secret,
      logger,
      maxFileBytes: options.maxFileBytes,
      maxProjectBytes: options.maxProjectFileBytes,
      allowedOrigins: options.allowedOrigins,
    }).then((handled) => {
      if (!handled) return hocuspocusHandler(request, response);
    });
  });
  return server;
}
