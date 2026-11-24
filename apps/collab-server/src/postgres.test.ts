import { HocuspocusProvider } from "@hocuspocus/provider";
import { Pool } from "pg";
import * as Y from "yjs";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLinkToken } from "@sceneroom/link-token";
import {
  addNode,
  createEmptyScene,
  createNode,
  readSceneFromDoc,
  writeSceneToDoc,
} from "@sceneroom/shared";
import { createCollabServer } from "./createServer";
import { MemoryFileStore } from "./fileStore";
import { PostgresDocumentStore } from "./postgresStore";
import { MemoryStore } from "./store";

// Step M8f: the collab server keeps its documents in Postgres, and they survive a restart. Uses the real Postgres of
// docker-compose.yml; only touches rows named "scene:pgint-...".
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom";
const SECRET = "a-test-secret-that-is-long-enough-123";
const PROJECT = "pgint-project";
const NAME = `scene:${PROJECT}:scene1`;

async function until(
  condition: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 5000,
) {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("collab server with Postgres documents", () => {
  const servers: ReturnType<typeof createCollabServer>[] = [];
  const stores: PostgresDocumentStore[] = [];
  const providers: HocuspocusProvider[] = [];

  const cleanup = async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query(
      "DELETE FROM collab_document WHERE name LIKE 'scene:pgint-%'",
    );
    await pool.end();
  };
  beforeEach(cleanup);
  afterEach(async () => {
    for (const provider of providers.splice(0)) provider.destroy();
    for (const server of servers.splice(0)) await server.destroy();
    for (const store of stores.splice(0)) await store.close();
  });
  afterAll(cleanup);

  async function startServer() {
    const documents = new PostgresDocumentStore(DATABASE_URL);
    await documents.check();
    stores.push(documents);
    const owners = new MemoryStore();
    const server = createCollabServer({
      port: 0,
      host: "127.0.0.1",
      secret: SECRET,
      store: documents,
      owners,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      maxMessageBytes: 1_048_576,
      maxDocumentBytes: 20_971_520,
      files: new MemoryFileStore(),
      maxFileBytes: 10_000,
      maxProjectFileBytes: 100_000,
      allowedOrigins: [],
      debounceMs: 20,
      maxDebounceMs: 100,
    });
    await server.listen();
    servers.push(server);
    return { server, documents };
  }

  function connect(server: ReturnType<typeof createCollabServer>) {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: server.webSocketURL,
      name: NAME,
      document: doc,
      token: createLinkToken({ projectId: PROJECT, role: "editor" }, SECRET),
    });
    providers.push(provider);
    return { doc, provider };
  }

  it("a scene saved through one server is there after the server is stopped and another one started", async () => {
    const first = await startServer();
    const alice = connect(first.server);
    await until(() => alice.provider.isSynced, "alice synced");
    let scene = createEmptyScene();
    scene = addNode(scene, {
      ...createNode("cube-1", "cube"),
      name: "My cube",
    });
    writeSceneToDoc(alice.doc, scene);

    // The server saves a moment after the change
    await until(
      async () => (await first.documents.load(NAME)) !== null,
      "saved to Postgres",
    );

    // Stop everything, as when the server restarts; nothing is kept in memory
    alice.provider.destroy();
    await first.server.destroy();

    const second = await startServer();
    const bob = connect(second.server);
    await until(() => bob.provider.isSynced, "bob synced");
    const { scene: read, issues } = readSceneFromDoc(bob.doc);
    expect(issues).toEqual([]);
    expect(read.nodes["cube-1"]?.name).toBe("My cube");
  });

  it("later changes replace the saved document (one row, the newest state)", async () => {
    const { server, documents } = await startServer();
    const alice = connect(server);
    await until(() => alice.provider.isSynced, "synced");
    let scene = createEmptyScene();
    scene = addNode(scene, { ...createNode("a", "cube"), name: "A" });
    writeSceneToDoc(alice.doc, scene);
    await until(
      async () => (await documents.load(NAME)) !== null,
      "first save",
    );
    scene = addNode(scene, { ...createNode("b", "sphere"), name: "B" });
    writeSceneToDoc(alice.doc, scene);
    await until(async () => {
      const bytes = await documents.load(NAME);
      if (!bytes) return false;
      const check = new Y.Doc();
      Y.applyUpdate(check, bytes);
      return "b" in readSceneFromDoc(check).scene.nodes;
    }, "second save");
    const pool = new Pool({ connectionString: DATABASE_URL });
    const rows = await pool.query(
      "SELECT count(*)::int AS n FROM collab_document WHERE name = $1",
      [NAME],
    );
    await pool.end();
    expect(rows.rows[0].n).toBe(1);
  });
});
