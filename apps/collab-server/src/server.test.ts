import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { afterEach, describe, expect, it } from "vitest";
import {
  addNode,
  applySceneChange,
  createEmptyScene,
  createNode,
  readSceneFromDoc,
  writeSceneToDoc,
} from "@sceneroom/shared";

import { createCollabServer } from "./createServer";
import { createLinkToken, type LinkRole } from "./linkToken";
import type { Logger } from "./logger";
import { MemoryStore } from "./store";

const SECRET = "a-test-secret-that-is-long-enough-123";
const PROJECT = "proj1";
const SCENE_DOC = `scene:${PROJECT}:scene1`;

function tokenFor(role: LinkRole, projectId = PROJECT): string {
  return createLinkToken({ projectId, role }, SECRET);
}

/** A logger that remembers what it was told. */
function recordingLogger() {
  const lines: string[] = [];
  const logger: Logger = {
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
  return { logger, lines };
}

async function until(
  condition: () => boolean,
  what: string,
  timeoutMs = 4000,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Client = {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  failed: () => string | null;
  closed: () => boolean;
};

describe("collab server", () => {
  const servers: ReturnType<typeof createCollabServer>[] = [];
  const clients: Client[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.provider.destroy();
      client.doc.destroy();
    }
    for (const server of servers.splice(0)) await server.destroy();
  });

  async function start(
    overrides: Partial<Parameters<typeof createCollabServer>[0]> = {},
  ) {
    const store = new MemoryStore();
    const { logger, lines } = recordingLogger();
    const server = createCollabServer({
      port: 0,
      host: "127.0.0.1",
      secret: SECRET,
      store,
      logger,
      maxMessageBytes: 1_048_576,
      maxDocumentBytes: 20_971_520,
      debounceMs: 20,
      maxDebounceMs: 100,
      ...overrides,
    });
    await server.listen();
    servers.push(server);
    return { server, store, lines };
  }

  function connect(
    server: ReturnType<typeof createCollabServer>,
    name: string,
    token: string,
  ): Client {
    const doc = new Y.Doc();
    let failure: string | null = null;
    let closed = false;
    const provider = new HocuspocusProvider({
      url: server.webSocketURL,
      name,
      document: doc,
      token,
      onAuthenticationFailed: ({ reason }) => {
        failure = reason;
      },
      onClose: () => {
        closed = true;
      },
    });
    const client = {
      doc,
      provider,
      failed: () => failure,
      closed: () => closed,
    };
    clients.push(client);
    return client;
  }

  async function connectSynced(
    server: ReturnType<typeof createCollabServer>,
    name: string,
    token: string,
  ): Promise<Client> {
    const client = connect(server, name, token);
    await until(() => client.provider.isSynced, `${name} synced`);
    return client;
  }

  it("an edit by one editor reaches another editor", async () => {
    const { server } = await start();
    const alice = await connectSynced(server, SCENE_DOC, tokenFor("editor"));
    const bob = await connectSynced(server, SCENE_DOC, tokenFor("editor"));

    const before = createEmptyScene();
    const after = addNode(before, createNode("cube1", "cube"));
    applySceneChange(alice.doc, before, after, "local");

    await until(
      () => readSceneFromDoc(bob.doc).scene.nodes["cube1"] !== undefined,
      "bob sees the cube",
    );
    expect(readSceneFromDoc(bob.doc).scene).toEqual(after);
  });

  it("refuses a missing token, a wrong signature, a token for another project and a bad document name", async () => {
    const { server, lines } = await start();
    const other = createLinkToken(
      { projectId: PROJECT, role: "editor" },
      "another-secret-that-is-long-enough-1",
    );
    const cases: [string, string][] = [
      [SCENE_DOC, "not-a-token"],
      [SCENE_DOC, other],
      [SCENE_DOC, tokenFor("editor", "proj2")],
      ["scene:proj1", tokenFor("editor")],
      ["whatever", tokenFor("editor")],
    ];
    const attempts = cases.map(([name, token]) => connect(server, name, token));
    await until(
      () => attempts.every((a) => a.failed() !== null),
      "every attempt refused",
    );
    for (const attempt of attempts) {
      expect(attempt.provider.isSynced).toBe(false);
      expect(attempt.provider.isAuthenticated).toBe(false);
    }
    expect(lines.filter((l) => l.startsWith("warn refused"))).toHaveLength(5);
  });

  it("a viewer sees changes but cannot make any, checked on the server", async () => {
    const { server, store } = await start();
    const editor = await connectSynced(server, SCENE_DOC, tokenFor("editor"));
    const viewer = await connectSynced(server, SCENE_DOC, tokenFor("viewer"));
    expect(viewer.provider.authorizedScope).toBe("readonly");
    expect(editor.provider.authorizedScope).toBe("read-write");

    // The viewer's own change is not accepted by the server ...
    viewer.doc.getMap("nodes").set("sneaky", new Y.Map([["id", "sneaky"]]));
    // ... while the editor's change goes through and reaches the viewer
    editor.doc.getMap("nodes").set("real", new Y.Map([["id", "real"]]));
    await until(
      () => viewer.doc.getMap("nodes").has("real"),
      "viewer gets real",
    );
    await pause(150);

    expect(editor.doc.getMap("nodes").has("sneaky")).toBe(false);
    await until(() => store.load(SCENE_DOC) !== null, "saved");
    const saved = new Y.Doc();
    Y.applyUpdate(saved, store.load(SCENE_DOC)!);
    expect(saved.getMap("nodes").has("real")).toBe(true);
    expect(saved.getMap("nodes").has("sneaky")).toBe(false);
  });

  it("documents survive a restart of the server", async () => {
    const store = new MemoryStore();
    const first = await start({ store });
    const alice = await connectSynced(
      first.server,
      SCENE_DOC,
      tokenFor("editor"),
    );
    const scene = addNode(createEmptyScene(), createNode("cube1", "cube"));
    writeSceneToDoc(alice.doc, scene);
    await until(() => store.load(SCENE_DOC) !== null, "saved");

    alice.provider.destroy();
    await first.server.destroy();
    servers.splice(servers.indexOf(first.server), 1);

    const second = await start({ store });
    const bob = await connectSynced(
      second.server,
      SCENE_DOC,
      tokenFor("viewer"),
    );
    expect(readSceneFromDoc(bob.doc).scene).toEqual(scene);
  });

  it("different projects and scenes are different documents", async () => {
    const { server } = await start();
    const a = await connectSynced(
      server,
      `scene:${PROJECT}:one`,
      tokenFor("editor"),
    );
    const b = await connectSynced(
      server,
      `scene:${PROJECT}:two`,
      tokenFor("editor"),
    );
    a.doc.getMap("nodes").set("x", new Y.Map([["id", "x"]]));
    await pause(150);
    expect(b.doc.getMap("nodes").has("x")).toBe(false);
  });

  it("a message over the size limit closes the connection and changes nothing", async () => {
    const { server, store } = await start({ maxMessageBytes: 10_000 });
    const editor = await connectSynced(server, SCENE_DOC, tokenFor("editor"));
    const watcher = await connectSynced(server, SCENE_DOC, tokenFor("editor"));
    const closedBefore = editor.closed();

    editor.doc.getMap("assets").set("huge", "x".repeat(200_000));
    await until(() => editor.closed() && !closedBefore, "connection closed");
    await pause(150);

    expect(watcher.doc.getMap("assets").has("huge")).toBe(false);
    expect(store.load(SCENE_DOC)).toBeNull();
  });

  it("a document over the size limit is not saved, and the log says so", async () => {
    const { server, store, lines } = await start({ maxDocumentBytes: 2000 });
    const editor = await connectSynced(server, SCENE_DOC, tokenFor("editor"));
    editor.doc.getMap("assets").set("big", "y".repeat(5000));
    await until(
      () => lines.some((l) => l.startsWith("error NOT SAVED")),
      "error logged",
    );
    expect(store.load(SCENE_DOC)).toBeNull();
  });

  it("a saved scene with an invalid object is reported in the log", async () => {
    const { server, lines } = await start();
    const editor = await connectSynced(server, SCENE_DOC, tokenFor("editor"));
    editor.doc.getMap("nodes").set(
      "bad",
      new Y.Map<unknown>([
        ["id", "bad"],
        ["name", 5],
      ]),
    );
    await until(
      () => lines.some((l) => l.includes("nodes/bad")),
      "invalid object logged",
    );
  });
});
