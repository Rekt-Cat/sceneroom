import { HocuspocusProvider } from "@hocuspocus/provider";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import { afterEach, describe, expect, it } from "vitest";
import { createCollabServer } from "./createServer";
import { MemoryFileStore } from "./fileStore";
import { verifyLinkToken } from "./linkToken";
import type { Logger } from "./logger";
import { MemoryStore } from "./store";

const SECRET = "a-test-secret-that-is-long-enough-123";
const ORIGIN = "http://localhost:3000";
const OWNER_KEY = "o".repeat(64);
const OTHER_KEY = "x".repeat(64);
const PROJECT = "proj1";
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

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

describe("share routes", () => {
  const servers: ReturnType<typeof createCollabServer>[] = [];
  const providers: HocuspocusProvider[] = [];
  afterEach(async () => {
    for (const provider of providers.splice(0)) provider.destroy();
    for (const server of servers.splice(0)) await server.destroy();
  });

  async function start() {
    const lines: string[] = [];
    const logger: Logger = {
      info: (m) => lines.push(`info ${m}`),
      warn: (m) => lines.push(`warn ${m}`),
      error: (m) => lines.push(`error ${m}`),
    };
    const store = new MemoryStore();
    const server = createCollabServer({
      port: 0,
      host: "127.0.0.1",
      secret: SECRET,
      store,
      owners: store,
      logger,
      maxMessageBytes: 1_048_576,
      maxDocumentBytes: 20_971_520,
      files: new MemoryFileStore(),
      maxFileBytes: 10_000,
      maxProjectFileBytes: 100_000,
      allowedOrigins: [ORIGIN],
      debounceMs: 20,
      maxDebounceMs: 100,
    });
    await server.listen();
    servers.push(server);
    const post = (
      path: string,
      key: string | null,
      body?: unknown,
      origin?: string,
    ) =>
      fetch(`${server.httpURL}${path}`, {
        method: "POST",
        headers: {
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
          ...(origin ? { Origin: origin } : {}),
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const mint = async (
      key: string,
      role: "editor" | "viewer",
      extra: object = {},
    ) => {
      const res = await post(`/share/${PROJECT}`, key, { role, ...extra });
      return {
        res,
        token: ((await res.json()) as { token?: string }).token ?? "",
      };
    };
    const connect = (token: string) => {
      const doc = new Y.Doc();
      let failed = false;
      let closed = false;
      const provider = new HocuspocusProvider({
        url: server.webSocketURL,
        name: `scene:${PROJECT}:s1`,
        document: doc,
        token,
        onAuthenticationFailed: () => {
          failed = true;
        },
        onClose: () => {
          closed = true;
        },
      });
      providers.push(provider);
      return { provider, failed: () => failed, closed: () => closed };
    };
    return { server, store, lines, post, mint, connect };
  }

  it("the first person to share a project becomes its owner and gets a working link", async () => {
    const { mint, connect, store } = await start();
    const { res, token } = await mint(OWNER_KEY, "editor");
    expect(res.status).toBe(200);
    expect(store.ownerHash(PROJECT)).toBe(
      sha256(new TextEncoder().encode(OWNER_KEY)),
    );
    expect(verifyLinkToken(token, SECRET)).toMatchObject({
      ok: true,
      projectId: PROJECT,
      role: "editor",
      generation: 0,
    });

    const client = connect(token);
    await until(() => client.provider.isSynced, "connected with the new link");
    expect(client.provider.authorizedScope).toBe("read-write");
  });

  it("a viewer link connects read-only", async () => {
    const { mint, connect } = await start();
    const { token } = await mint(OWNER_KEY, "viewer");
    const client = connect(token);
    await until(() => client.provider.isSynced, "connected");
    expect(client.provider.authorizedScope).toBe("readonly");
  });

  it("somebody else's key cannot make links for a project that has an owner", async () => {
    const { mint, lines } = await start();
    await mint(OWNER_KEY, "editor");
    const stranger = await mint(OTHER_KEY, "editor");
    expect(stranger.res.status).toBe(403);
    expect(stranger.token).toBe("");
    expect(lines.some((l) => l.includes("not the owner key"))).toBe(true);
  });

  it("no key, a short key and a key that is too long are refused", async () => {
    const { post, store } = await start();
    expect(
      (await post(`/share/${PROJECT}`, null, { role: "editor" })).status,
    ).toBe(401);
    expect(
      (await post(`/share/${PROJECT}`, "short", { role: "editor" })).status,
    ).toBe(401);
    expect(
      (await post(`/share/${PROJECT}`, "k".repeat(500), { role: "editor" }))
        .status,
    ).toBe(401);
    expect(store.ownerHash(PROJECT)).toBeNull(); // none of them claimed the project
  });

  it("a request with a bad body is refused and does not claim a project twice", async () => {
    const { post, mint } = await start();
    for (const body of [
      { role: "owner" },
      { role: "editor", expiresInDays: 0 },
      { role: "editor", expiresInDays: 9999 },
      { nope: 1 },
    ]) {
      expect((await post(`/share/${PROJECT}`, OWNER_KEY, body)).status).toBe(
        400,
      );
    }
    expect((await mint(OWNER_KEY, "viewer")).res.status).toBe(200);
  });

  it("an expiry makes the link stop working after that many days", async () => {
    const { mint } = await start();
    const { token } = await mint(OWNER_KEY, "editor", { expiresInDays: 2 });
    const now = Math.floor(Date.now() / 1000);
    expect(verifyLinkToken(token, SECRET, now + 86_400)).toMatchObject({
      ok: true,
    });
    expect(verifyLinkToken(token, SECRET, now + 3 * 86_400)).toMatchObject({
      ok: false,
      reason: "expired",
    });
    const forever = await mint(OWNER_KEY, "editor");
    expect(
      verifyLinkToken(forever.token, SECRET, now + 400 * 86_400),
    ).toMatchObject({ ok: true });
  });

  it("cancelling the links refuses old links, disconnects people, and new links work", async () => {
    const { mint, post, connect } = await start();
    const { token: oldToken } = await mint(OWNER_KEY, "editor");
    const connected = connect(oldToken);
    await until(() => connected.provider.isSynced, "connected");

    // Not the owner: refused
    expect((await post(`/share/${PROJECT}/reset`, OTHER_KEY)).status).toBe(403);

    const reset = await post(`/share/${PROJECT}/reset`, OWNER_KEY);
    expect(reset.status).toBe(200);
    expect(((await reset.json()) as { generation: number }).generation).toBe(1);

    // The person who was connected is disconnected, and cannot come back with the old link, not even by reconnecting
    await until(() => connected.closed(), "disconnected");
    await until(
      () => connected.failed(),
      "the same connection is refused when it comes back",
    );
    const again = connect(oldToken);
    await until(() => again.failed(), "old link refused");

    // The old link no longer works for files either
    const file = await fetch(
      `${servers[0]!.httpURL}/files/${PROJECT}/${"a".repeat(64)}`,
      {
        headers: { Authorization: `Bearer ${oldToken}` },
      },
    );
    expect(file.status).toBe(403);

    // A link made after the reset works
    const { token: newToken } = await mint(OWNER_KEY, "editor");
    expect(verifyLinkToken(newToken, SECRET)).toMatchObject({ generation: 1 });
    const fresh = connect(newToken);
    await until(() => fresh.provider.isSynced, "new link works");
  });

  it("cancelling links of a project nobody has shared is a 404", async () => {
    const { post } = await start();
    expect((await post(`/share/${PROJECT}/reset`, OWNER_KEY)).status).toBe(404);
  });

  it("a bad project id and other methods are refused", async () => {
    const { post, server } = await start();
    expect(
      (await post("/share/bad%20id", OWNER_KEY, { role: "editor" })).status,
    ).toBe(400);
    const get = await fetch(`${server.httpURL}/share/${PROJECT}`);
    expect(get.status).toBe(405);
  });

  it("the browser's check before a call (CORS) is answered for allowed origins only", async () => {
    const { server } = await start();
    const allowed = await fetch(`${server.httpURL}/share/${PROJECT}`, {
      method: "OPTIONS",
      headers: { Origin: ORIGIN },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const stranger = await fetch(`${server.httpURL}/share/${PROJECT}`, {
      method: "OPTIONS",
      headers: { Origin: "http://evil.example" },
    });
    expect(stranger.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("tokens made by hand (generation 0) still work for a project nobody has claimed", async () => {
    const { connect } = await start();
    const { createLinkToken } = await import("./linkToken");
    const client = connect(
      createLinkToken({ projectId: PROJECT, role: "editor" }, SECRET),
    );
    await until(() => client.provider.isSynced, "hand-made link works");
  });
});
