import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { afterEach, describe, expect, it } from "vitest";
import { createLinkToken, signAdminRequest } from "@sceneroom/link-token";
import { createCollabServer } from "./createServer";
import { MemoryFileStore } from "./fileStore";
import type { Logger } from "./logger";
import { MemoryStore } from "./store";

const SECRET = "a-test-secret-that-is-long-enough-123";
const PROJECT = "proj1";
const OTHER_PROJECT = "proj2";

async function until(condition: () => boolean, what: string, timeoutMs = 4000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("the internal disconnect route", () => {
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
      allowedOrigins: [],
      debounceMs: 20,
      maxDebounceMs: 100,
    });
    await server.listen();
    servers.push(server);

    /** Someone connected with a token made for `userId`. `closes` counts how many times the connection was closed. */
    const connect = (userId: string | undefined, project = PROJECT) => {
      const doc = new Y.Doc();
      const state = { closes: 0 };
      const provider = new HocuspocusProvider({
        url: server.webSocketURL,
        name: `scene:${project}:s1`,
        document: doc,
        token: createLinkToken(
          { projectId: project, role: "editor", userId },
          SECRET,
        ),
        onClose: () => {
          state.closes += 1;
        },
      });
      providers.push(provider);
      return { provider, state };
    };

    const call = (
      payload: unknown,
      options: {
        secret?: string;
        timestamp?: number;
        method?: string;
        rawBody?: string;
      } = {},
    ) => {
      const raw = options.rawBody ?? JSON.stringify(payload);
      const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
      return fetch(`${server.httpURL}/internal/disconnect`, {
        method: options.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Timestamp": String(timestamp),
          "X-Admin-Signature": signAdminRequest(
            options.secret ?? SECRET,
            timestamp,
            raw,
          ),
        },
        body: options.method === "GET" ? undefined : raw,
      });
    };
    return { server, lines, connect, call };
  }

  it("closes one person's connections and leaves everybody else's alone", async () => {
    const { connect, call } = await start();
    const alice = connect("alice");
    const bob = connect("bob");
    const link = connect(undefined);
    const elsewhere = connect("bob", OTHER_PROJECT);
    for (const c of [alice, bob, link, elsewhere]) {
      await until(() => c.provider.isSynced, "connected");
    }

    const response = await call({ projectId: PROJECT, userId: "bob" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ closed: 1 });
    await until(() => bob.state.closes >= 1, "bob was disconnected");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect([
      alice.state.closes,
      link.state.closes,
      elsewhere.state.closes,
    ]).toEqual([0, 0, 0]);
  });

  it("without a person it closes everybody in that project, and only that project", async () => {
    const { connect, call } = await start();
    const alice = connect("alice");
    const bob = connect("bob");
    const elsewhere = connect("bob", OTHER_PROJECT);
    for (const c of [alice, bob, elsewhere])
      await until(() => c.provider.isSynced, "connected");
    const response = await call({ projectId: PROJECT });
    expect(await response.json()).toEqual({ closed: 2 });
    await until(
      () => alice.state.closes >= 1 && bob.state.closes >= 1,
      "both disconnected",
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(elsewhere.state.closes).toBe(0);
  });

  it("says 0 when nobody of that person is connected", async () => {
    const { call } = await start();
    const response = await call({ projectId: PROJECT, userId: "nobody" });
    expect(await response.json()).toEqual({ closed: 0 });
  });

  it("refuses a wrong signature, an old time, a changed body and a wrong method, and says so in the log", async () => {
    const { connect, call, lines } = await start();
    const bob = connect("bob");
    await until(() => bob.provider.isSynced, "connected");
    const payload = { projectId: PROJECT, userId: "bob" };
    expect((await call(payload, { secret: "z".repeat(40) })).status).toBe(401);
    expect(
      (await call(payload, { timestamp: Math.floor(Date.now() / 1000) - 3600 }))
        .status,
    ).toBe(401);
    const raw = JSON.stringify(payload);
    const response = await fetch(
      `${(await start()).server.httpURL}/internal/disconnect`,
      { method: "POST", body: raw },
    );
    expect(response.status).toBe(401);
    expect((await call(payload, { method: "GET" })).status).toBe(405);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(bob.state.closes).toBe(0);
    expect(
      lines.filter((l) => l.startsWith("warn admin: refused")).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("refuses a body that is not the right shape (even when signed)", async () => {
    const { call } = await start();
    expect((await call({ projectId: "bad id!" })).status).toBe(400);
    expect((await call({ userId: "x" })).status).toBe(400);
    expect((await call(undefined, { rawBody: "{not json" })).status).toBe(400);
    expect(
      (await call({ projectId: PROJECT, extra: "x".repeat(2000) })).status,
    ).toBe(413);
  });

  it("sends no CORS headers, so no web page can use it", async () => {
    const { server } = await start();
    const response = await fetch(`${server.httpURL}/internal/disconnect`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
