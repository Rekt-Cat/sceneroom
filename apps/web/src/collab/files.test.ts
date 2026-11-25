import { describe, expect, it, vi } from "vitest";
import { MemoryAssetStorage } from "@/assets/assetStorage";
import { sha256Hex } from "@/assets/hash";
import { createFileClient, fileBaseUrl } from "./fileClient";
import { createFileUploader } from "./fileUploader";
import { OnlineAssetStorage } from "./onlineAssetStorage";

const bytes = (text: string): ArrayBuffer =>
  new TextEncoder().encode(text).buffer as ArrayBuffer;

describe("fileBaseUrl", () => {
  it("turns the WebSocket address into the HTTP address of the file routes", () => {
    expect(fileBaseUrl("ws://127.0.0.1:1234")).toBe(
      "http://127.0.0.1:1234/files",
    );
    expect(fileBaseUrl("wss://collab.example.com/socket?x=1")).toBe(
      "https://collab.example.com/files",
    );
  });
});

/** A fake server: files by "project/id", answers like the real routes. */
function fakeServer() {
  const files = new Map<string, ArrayBuffer>();
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const key = url.split("/files/")[1]!;
    const method = init?.method ?? "GET";
    calls.push(`${method} ${key}`);
    if (method === "PUT") {
      files.set(key, init!.body as ArrayBuffer);
      return new Response("Stored", { status: 201 });
    }
    const found = files.get(key);
    if (!found) return new Response("No such file", { status: 404 });
    return new Response(method === "HEAD" ? null : found, { status: 200 });
  }) as typeof fetch;
  return { files, calls, fetchImpl };
}

describe("file client", () => {
  it("uploads, asks and downloads; a missing file is false and null", async () => {
    const server = fakeServer();
    const client = createFileClient({
      url: "ws://x:1",
      projectId: "p",
      token: "t",
      fetchImpl: server.fetchImpl,
    });
    const data = bytes("hello");
    const id = await sha256Hex(data);
    expect(await client.has(id)).toBe(false);
    expect(await client.download(id)).toBeNull();
    await client.upload(id, new Uint8Array(data));
    expect(await client.has(id)).toBe(true);
    expect(await client.download(id)).toEqual(data);
  });

  it("bytes that do not match the id are never accepted", async () => {
    const server = fakeServer();
    const client = createFileClient({
      url: "ws://x:1",
      projectId: "p",
      token: "t",
      fetchImpl: server.fetchImpl,
    });
    const id = await sha256Hex(bytes("the real one"));
    server.files.set(`p/${id}`, bytes("a swapped file"));
    await expect(client.download(id)).rejects.toThrow(/does not match/);
  });

  it("sends the token, and an error from the server is an error", async () => {
    let seen: HeadersInit | undefined;
    const client = createFileClient({
      url: "ws://x:1",
      projectId: "p",
      token: "my-token",
      fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        seen = init?.headers;
        return new Response("no", { status: 403 });
      }) as typeof fetch,
    });
    await expect(
      client.upload("a".repeat(64), new Uint8Array([1])),
    ).rejects.toThrow(/403/);
    expect(seen).toMatchObject({ Authorization: "Bearer my-token" });
    await expect(client.has("a".repeat(64))).rejects.toThrow(/403/);
  });
});

describe("OnlineAssetStorage", () => {
  const noWait = { sleep: async () => undefined };

  it("a file you have is read from your own storage, without asking the server", async () => {
    const inner = new MemoryAssetStorage();
    await inner.put("a", bytes("mine"));
    const download = vi.fn(async () => null);
    const storage = new OnlineAssetStorage(inner, { download }, noWait);
    expect(await storage.get("a")).toEqual(bytes("mine"));
    expect(download).not.toHaveBeenCalled();
  });

  it("a file you do not have is downloaded, kept, and not downloaded again", async () => {
    const inner = new MemoryAssetStorage();
    const download = vi.fn(async () => bytes("theirs"));
    const storage = new OnlineAssetStorage(inner, { download }, noWait);
    expect(await storage.get("b")).toEqual(bytes("theirs"));
    expect(await inner.has("b")).toBe(true);
    await storage.get("b");
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("asking twice at once downloads once", async () => {
    const download = vi.fn(async () => bytes("x"));
    const storage = new OnlineAssetStorage(
      new MemoryAssetStorage(),
      { download },
      noWait,
    );
    await Promise.all([storage.get("c"), storage.get("c"), storage.get("c")]);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("waits for a file the sender is still uploading (404 first, then there)", async () => {
    let calls = 0;
    const download = vi.fn(async () => (++calls < 3 ? null : bytes("late")));
    const storage = new OnlineAssetStorage(
      new MemoryAssetStorage(),
      { download },
      noWait,
    );
    expect(await storage.get("d")).toEqual(bytes("late"));
    expect(download).toHaveBeenCalledTimes(3);
  });

  it("keeps trying through network errors and bad bytes", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let calls = 0;
    const download = vi.fn(async () => {
      if (++calls === 1) throw new Error("network down");
      if (calls === 2) throw new Error("does not match");
      return bytes("ok");
    });
    const storage = new OnlineAssetStorage(
      new MemoryAssetStorage(),
      { download },
      noWait,
    );
    expect(await storage.get("e")).toEqual(bytes("ok"));
  });

  it("gives up after the tries, and then answers 'missing' at once for a while", async () => {
    const download = vi.fn(async () => null);
    let now = 1000;
    const storage = new OnlineAssetStorage(
      new MemoryAssetStorage(),
      { download },
      { retryDelaysMs: [1, 1], sleep: async () => undefined, now: () => now },
    );
    expect(await storage.get("f")).toBeUndefined();
    expect(download).toHaveBeenCalledTimes(3);
    expect(await storage.get("f")).toBeUndefined();
    expect(download).toHaveBeenCalledTimes(3); // not asked again
    now += 31_000;
    await storage.get("f");
    expect(download).toHaveBeenCalledTimes(6); // after the pause, it tries again
  });

  it("put and has go to your own storage", async () => {
    const inner = new MemoryAssetStorage();
    const storage = new OnlineAssetStorage(
      inner,
      { download: async () => null },
      noWait,
    );
    await storage.put("g", bytes("z"));
    expect(await storage.has("g")).toBe(true);
    expect(await inner.has("g")).toBe(true);
  });
});

describe("file uploader", () => {
  function setup() {
    const storage = new MemoryAssetStorage();
    const onServer = new Set<string>();
    const uploads: string[] = [];
    const client = {
      has: vi.fn(async (id: string) => onServer.has(id)),
      upload: vi.fn(async (id: string) => {
        uploads.push(id);
        onServer.add(id);
      }),
    };
    const uploader = createFileUploader({
      client,
      storage,
      prepare: async (_id, data) => data,
      delayMs: 1,
      retryMs: 5,
    });
    return { storage, onServer, uploads, client, uploader };
  }

  it("sends the files the scene refers to that the server does not have", async () => {
    const { storage, uploads, uploader } = setup();
    await storage.put("a", bytes("A"));
    await storage.put("b", bytes("B"));
    uploader.request(["a", "b"]);
    await uploader.idle();
    expect(uploads.sort()).toEqual(["a", "b"]);
  });

  it("does not send a file the server already has, nor one it sent before", async () => {
    const { storage, onServer, uploads, client, uploader } = setup();
    await storage.put("a", bytes("A"));
    await storage.put("b", bytes("B"));
    onServer.add("a");
    uploader.request(["a", "b"]);
    await uploader.idle();
    expect(uploads).toEqual(["b"]);
    client.has.mockClear();
    uploader.request(["a", "b"]);
    await uploader.idle();
    expect(client.has).not.toHaveBeenCalled(); // both are known to be there now
  });

  it("skips files that are not in your own storage (they came from someone else)", async () => {
    const { uploads, client, uploader } = setup();
    uploader.request(["not-mine"]);
    await uploader.idle();
    expect(uploads).toEqual([]);
    expect(client.upload).not.toHaveBeenCalled();
  });

  it("a file that is no longer referenced by the time it is its turn is skipped", async () => {
    const { storage, uploads, uploader } = setup();
    await storage.put("old", bytes("old picture"));
    await storage.put("new", bytes("new picture"));
    uploader.request(["old"]);
    uploader.request(["new"]); // painted over before the first pass
    await uploader.idle();
    expect(uploads).toEqual(["new"]);
  });

  it("sends the prepared bytes (a patch becomes the whole mesh)", async () => {
    const storage = new MemoryAssetStorage();
    await storage.put("m", bytes("patch"));
    const sent: Uint8Array[] = [];
    const uploader = createFileUploader({
      client: {
        has: async () => false,
        upload: async (_id, data) => void sent.push(data),
      },
      storage,
      prepare: async () => new TextEncoder().encode("whole mesh"),
      delayMs: 1,
    });
    uploader.request(["m"]);
    await uploader.idle();
    expect(new TextDecoder().decode(sent[0])).toBe("whole mesh");
  });

  it("a failed upload is tried again later", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage = new MemoryAssetStorage();
    await storage.put("a", bytes("A"));
    let attempts = 0;
    const uploads: string[] = [];
    const uploader = createFileUploader({
      client: {
        has: async () => false,
        upload: async (id) => {
          if (++attempts === 1) throw new Error("offline");
          uploads.push(id);
        },
      },
      storage,
      prepare: async (_id, data) => data,
      delayMs: 1,
      retryMs: 5,
    });
    uploader.request(["a"]);
    await uploader.idle();
    expect(uploads).toEqual(["a"]);
    expect(attempts).toBe(2);
  });

  it("after destroy nothing is sent", async () => {
    const { storage, uploads, uploader } = setup();
    await storage.put("a", bytes("A"));
    uploader.request(["a"]);
    uploader.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(uploads).toEqual([]);
  });
});

describe("file client with a source of tokens", () => {
  it("asks the source for a token on each call (the cached one), so an account token can be renewed", async () => {
    let n = 0;
    const seen: string[] = [];
    const client = createFileClient({
      url: "ws://127.0.0.1:1234",
      projectId: "p",
      token: {
        fresh: async () => "unused",
        cached: async () => `t${++n}`,
      },
      fetchImpl: async (_url, init) => {
        seen.push(
          String((init?.headers as Record<string, string>).Authorization),
        );
        return new Response(null, { status: 404 });
      },
    });
    await client.has("a".repeat(64));
    await client.has("b".repeat(64));
    expect(seen).toEqual(["Bearer t1", "Bearer t2"]);
  });
});
