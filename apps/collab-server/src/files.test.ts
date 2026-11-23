import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCollabServer } from "./createServer";
import { FolderFileStore, MemoryFileStore, type FileStore } from "./fileStore";
import { createLinkToken, type LinkRole } from "./linkToken";
import type { Logger } from "./logger";
import { MemoryStore } from "./store";

const SECRET = "a-test-secret-that-is-long-enough-123";
const PROJECT = "proj1";
const ORIGIN = "http://localhost:3000";

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const token = (role: LinkRole, projectId = PROJECT) =>
  createLinkToken({ projectId, role }, SECRET);
const bytesOf = (text: string) => new TextEncoder().encode(text);

describe("file routes", () => {
  const servers: ReturnType<typeof createCollabServer>[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await server.destroy();
  });

  async function start(
    options: {
      files?: FileStore;
      maxFileBytes?: number;
      maxProjectFileBytes?: number;
    } = {},
  ) {
    const lines: string[] = [];
    const logger: Logger = {
      info: (m) => lines.push(`info ${m}`),
      warn: (m) => lines.push(`warn ${m}`),
      error: (m) => lines.push(`error ${m}`),
    };
    const files = options.files ?? new MemoryFileStore();
    const server = createCollabServer({
      port: 0,
      host: "127.0.0.1",
      secret: SECRET,
      store: new MemoryStore(),
      logger,
      maxMessageBytes: 1_048_576,
      maxDocumentBytes: 20_971_520,
      files,
      maxFileBytes: options.maxFileBytes ?? 1000,
      maxProjectFileBytes: options.maxProjectFileBytes ?? 10_000,
      allowedOrigins: [ORIGIN],
    });
    await server.listen();
    servers.push(server);
    const base = server.httpURL;
    const call = (
      method: string,
      path: string,
      init: { token?: string; body?: Uint8Array; origin?: string } = {},
    ) =>
      fetch(`${base}${path}`, {
        method,
        headers: {
          ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
          ...(init.origin ? { Origin: init.origin } : {}),
        },
        body: init.body,
      });
    return { call, files, lines };
  }

  const path = (id: string, projectId = PROJECT) => `/files/${projectId}/${id}`;

  it("an editor uploads a file, and an editor and a viewer can download it", async () => {
    const { call } = await start();
    const data = bytesOf("a model");
    const id = sha256(data);

    const put = await call("PUT", path(id), {
      token: token("editor"),
      body: data,
    });
    expect(put.status).toBe(201);

    for (const role of ["editor", "viewer"] as const) {
      const got = await call("GET", path(id), { token: token(role) });
      expect(got.status).toBe(200);
      expect(new Uint8Array(await got.arrayBuffer())).toEqual(data);
    }
    const head = await call("HEAD", path(id), { token: token("viewer") });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(data.length));
  });

  it("uploading the same file again is harmless", async () => {
    const { call } = await start();
    const data = bytesOf("same");
    const id = sha256(data);
    expect(
      (await call("PUT", path(id), { token: token("editor"), body: data }))
        .status,
    ).toBe(201);
    expect(
      (await call("PUT", path(id), { token: token("editor"), body: data }))
        .status,
    ).toBe(200);
  });

  it("a file that is not there is a 404", async () => {
    const { call } = await start();
    const res = await call("GET", path(sha256(bytesOf("nothing"))), {
      token: token("editor"),
    });
    expect(res.status).toBe(404);
  });

  it("bytes that do not match the id are refused (nobody can store other bytes under an id)", async () => {
    const { call, files, lines } = await start();
    const id = sha256(bytesOf("the real file"));
    const res = await call("PUT", path(id), {
      token: token("editor"),
      body: bytesOf("something else"),
    });
    expect(res.status).toBe(400);
    expect(await files.has(PROJECT, id)).toBe(false);
    expect(lines.some((l) => l.includes("do not match"))).toBe(true);
  });

  it("a viewer cannot upload", async () => {
    const { call, files } = await start();
    const data = bytesOf("viewer upload");
    const id = sha256(data);
    const res = await call("PUT", path(id), {
      token: token("viewer"),
      body: data,
    });
    expect(res.status).toBe(403);
    expect(await files.has(PROJECT, id)).toBe(false);
  });

  it("no token, a bad token and a token for another project are refused", async () => {
    const { call } = await start();
    const data = bytesOf("secret");
    const id = sha256(data);
    await call("PUT", path(id), { token: token("editor"), body: data });
    expect((await call("GET", path(id))).status).toBe(401);
    expect((await call("GET", path(id), { token: "garbage" })).status).toBe(
      401,
    );
    expect(
      (await call("GET", path(id), { token: token("editor", "proj2") })).status,
    ).toBe(403);
  });

  it("projects do not see each other's files", async () => {
    const { call } = await start();
    const data = bytesOf("project one only");
    const id = sha256(data);
    await call("PUT", path(id), { token: token("editor"), body: data });
    const other = await call("GET", path(id, "proj2"), {
      token: token("editor", "proj2"),
    });
    expect(other.status).toBe(404);
  });

  it("a file over the size limit is refused", async () => {
    const { call, files } = await start({ maxFileBytes: 100 });
    const data = new Uint8Array(500).fill(7);
    const id = sha256(data);
    const res = await call("PUT", path(id), {
      token: token("editor"),
      body: data,
    });
    expect(res.status).toBe(413);
    expect(await files.has(PROJECT, id)).toBe(false);
  });

  it("a project over its file limit cannot add more", async () => {
    const { call } = await start({
      maxFileBytes: 1000,
      maxProjectFileBytes: 250,
    });
    const make = (n: number) => new Uint8Array(100).fill(n);
    expect(
      (
        await call("PUT", path(sha256(make(1))), {
          token: token("editor"),
          body: make(1),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call("PUT", path(sha256(make(2))), {
          token: token("editor"),
          body: make(2),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call("PUT", path(sha256(make(3))), {
          token: token("editor"),
          body: make(3),
        })
      ).status,
    ).toBe(413);
  });

  it("an address that is not a project id and a 64-hex file id is refused", async () => {
    const { call } = await start();
    for (const bad of [
      "/files/proj1/not-a-hash",
      `/files/proj1/${"A".repeat(64)}`,
      "/files/proj1/..%2F..%2Fx",
      `/files/pro%20j/${"a".repeat(64)}`,
    ]) {
      const res = await call("GET", bad, { token: token("editor") });
      expect([400, 404]).toContain(res.status);
    }
  });

  it("other methods are refused", async () => {
    const { call } = await start();
    const res = await call("DELETE", path("a".repeat(64)), {
      token: token("editor"),
    });
    expect(res.status).toBe(405);
  });

  it("the browser's check before a call (CORS) is answered for allowed origins only", async () => {
    const { call } = await start();
    const allowed = await call("OPTIONS", path("a".repeat(64)), {
      origin: ORIGIN,
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(allowed.headers.get("access-control-allow-headers")).toContain(
      "Authorization",
    );

    const stranger = await call("OPTIONS", path("a".repeat(64)), {
      origin: "http://evil.example",
    });
    expect(stranger.headers.get("access-control-allow-origin")).toBeNull();

    const data = bytesOf("cors");
    await call("PUT", path(sha256(data)), {
      token: token("editor"),
      body: data,
    });
    const got = await call("GET", path(sha256(data)), {
      token: token("editor"),
      origin: ORIGIN,
    });
    expect(got.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("other addresses still go to Hocuspocus", async () => {
    const { call } = await start();
    const res = await call("GET", "/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Hocuspocus");
  });
});

describe("FolderFileStore", () => {
  it("keeps files in a folder, counts them, and refuses ids that are not hashes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sceneroom-files-"));
    try {
      const store = new FolderFileStore(dir);
      const data = bytesOf("on disk");
      const id = sha256(data);
      expect(await store.get("p", id)).toBeNull();
      expect(await store.projectBytes("p")).toBe(0);
      await store.put("p", id, data);
      await store.put("p", id, data); // again: nothing happens
      expect(new Uint8Array((await store.get("p", id))!)).toEqual(data);
      expect(await store.projectBytes("p")).toBe(data.length);
      expect(await store.has("p", id)).toBe(true);
      expect(await store.has("q", id)).toBe(false);
      await expect(store.get("p", "../../etc/passwd")).rejects.toThrow();
      await expect(store.put("../p", id, data)).rejects.toThrow();
      // a new store over the same folder sees the file (it survives a restart)
      expect(await new FolderFileStore(dir).has("p", id)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
