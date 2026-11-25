import { afterEach, describe, expect, it } from "vitest";
import { createCollabServer } from "./createServer";
import { MemoryFileStore } from "./fileStore";
import { MemoryStore } from "./store";

describe("the health route", () => {
  const servers: ReturnType<typeof createCollabServer>[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await server.destroy();
  });

  async function start() {
    const store = new MemoryStore();
    const server = createCollabServer({
      port: 0,
      host: "127.0.0.1",
      secret: "a-test-secret-that-is-long-enough-123",
      store,
      owners: store,
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
    });
    await server.listen();
    servers.push(server);
    return server;
  }

  it("answers 200 ok to anyone, with no login, and is never cached", async () => {
    const server = await start();
    const response = await fetch(`${server.httpURL}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(
      (await fetch(`${server.httpURL}/health`, { method: "HEAD" })).status,
    ).toBe(200);
  });

  it("only GET and HEAD, and shows nothing about the settings", async () => {
    const server = await start();
    const post = await fetch(`${server.httpURL}/health`, { method: "POST" });
    expect(post.status).toBe(405);
    const text = await (await fetch(`${server.httpURL}/health`)).text();
    expect(text).not.toMatch(/secret|database|path|version/i);
  });
});

describe("link sharing switched off", () => {
  it("answers 404 on /share/... and leaves everything else as it was", async () => {
    const store = new MemoryStore();
    const server = createCollabServer({
      port: 0,
      host: "127.0.0.1",
      secret: "a-test-secret-that-is-long-enough-123",
      store,
      owners: store,
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
      linkSharing: false,
    });
    await server.listen();
    try {
      const share = await fetch(`${server.httpURL}/share/proj1`, {
        method: "POST",
      });
      expect(share.status).toBe(404);
      expect(await share.json()).toEqual({
        error: "Link sharing is switched off on this server.",
      });
      expect((await fetch(`${server.httpURL}/health`)).status).toBe(200);
      expect(
        (await fetch(`${server.httpURL}/files/proj1/${"a".repeat(64)}`)).status,
      ).toBe(401);
    } finally {
      await server.destroy();
    }
  });
});
