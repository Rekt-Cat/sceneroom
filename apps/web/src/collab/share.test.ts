import { afterEach, describe, expect, it, vi } from "vitest";
import { getOwnerKey, makeOwnerKey } from "./ownerKey";
import {
  forgetConnection,
  loadConnection,
  saveConnection,
} from "./savedConnection";
import {
  DEFAULT_COLLAB_URL,
  collabServerUrl,
  isWebSocketUrl,
  loadServerOverride,
  saveServerOverride,
  serverHttpUrl,
} from "./serverAddress";
import { ShareError, createShareClient } from "./shareClient";
import { buildShareLink } from "./shareLink";

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
  });
  return data;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("server addresses", () => {
  it("knows WebSocket addresses", () => {
    expect(isWebSocketUrl("ws://127.0.0.1:1234")).toBe(true);
    expect(isWebSocketUrl("wss://collab.example.com")).toBe(true);
    for (const bad of [
      "http://x",
      "ftp://x",
      "not a url",
      "",
      "javascript:alert(1)",
    ]) {
      expect(isWebSocketUrl(bad)).toBe(false);
    }
  });

  it("turns a WebSocket address into the HTTP address of a path", () => {
    expect(serverHttpUrl("ws://127.0.0.1:1234", "/share/p1")).toBe(
      "http://127.0.0.1:1234/share/p1",
    );
    expect(
      serverHttpUrl("wss://c.example.com/socket?x=1#y", "/share/p1/reset"),
    ).toBe("https://c.example.com/share/p1/reset");
  });

  it("the typed address wins over the configured one, and can be removed", () => {
    stubStorage();
    expect(collabServerUrl()).toBe(DEFAULT_COLLAB_URL);
    saveServerOverride("ws://other:9");
    expect(collabServerUrl()).toBe("ws://other:9");
    saveServerOverride(null);
    expect(collabServerUrl()).toBe(DEFAULT_COLLAB_URL);
  });

  it("a stored address that is not a WebSocket address is ignored", () => {
    stubStorage({ "sceneroom-collab-server": "http://evil" });
    expect(loadServerOverride()).toBeNull();
  });
});

describe("share link", () => {
  it("holds the project, the server, the token and the scene", () => {
    const link = buildShareLink({
      origin: "http://localhost:3000",
      projectId: "p1",
      url: "ws://127.0.0.1:1234",
      token: "a.b",
      sceneId: "s-1",
    });
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe("http://localhost:3000/p/p1");
    expect(url.searchParams.get("collab")).toBe("ws://127.0.0.1:1234");
    expect(url.searchParams.get("token")).toBe("a.b");
    expect(url.searchParams.get("scene")).toBe("s-1");
  });
});

describe("owner key", () => {
  it("is 64 random hex characters", () => {
    const a = makeOwnerKey();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(makeOwnerKey()).not.toBe(a);
  });

  it("is made once per project and kept; without `create` nothing is made", () => {
    stubStorage();
    expect(getOwnerKey("p1", false)).toBeNull();
    const key = getOwnerKey("p1", true)!;
    expect(getOwnerKey("p1", false)).toBe(key);
    expect(getOwnerKey("p1", true)).toBe(key);
    expect(getOwnerKey("p2", true)).not.toBe(key);
  });

  it("blocked storage gives null instead of an error", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(getOwnerKey("p1", true)).toBeNull();
  });
});

describe("saved connection", () => {
  it("is saved, read back and forgotten, per project", () => {
    stubStorage();
    expect(loadConnection("p1")).toBeNull();
    saveConnection("p1", { url: "ws://x:1", token: "t" });
    expect(loadConnection("p1")).toEqual({ url: "ws://x:1", token: "t" });
    expect(loadConnection("p2")).toBeNull();
    forgetConnection("p1");
    expect(loadConnection("p1")).toBeNull();
  });

  it("stored data that is not a valid connection is ignored", () => {
    stubStorage({
      "sceneroom-collab-link:a": "not json",
      "sceneroom-collab-link:b": JSON.stringify({
        url: "http://x",
        token: "t",
      }),
      "sceneroom-collab-link:c": JSON.stringify({ url: "ws://x", token: "" }),
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const id of ["a", "b", "c"]) expect(loadConnection(id)).toBeNull();
  });
});

describe("share client", () => {
  function client(
    respond: (url: string, init: RequestInit) => Response | Promise<Response>,
  ) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return respond(String(input), init ?? {});
    }) as typeof fetch;
    return {
      calls,
      share: createShareClient({
        url: "ws://127.0.0.1:1234",
        projectId: "p1",
        ownerKey: "k".repeat(64),
        fetchImpl,
      }),
    };
  }
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });

  it("asks for a link with the owner key and the role, and returns the token", async () => {
    const { share, calls } = client(() => ok({ token: "the.token" }));
    expect(await share.makeLink("viewer", 7)).toBe("the.token");
    expect(calls[0]!.url).toBe("http://127.0.0.1:1234/share/p1");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toMatchObject({
      Authorization: `Bearer ${"k".repeat(64)}`,
    });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      role: "viewer",
      expiresInDays: 7,
    });
  });

  it("leaves the expiry out for a link that does not run out", async () => {
    const { share, calls } = client(() => ok({ token: "t" }));
    await share.makeLink("editor");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      role: "editor",
    });
  });

  it("cancelling links calls the reset route", async () => {
    const { share, calls } = client(() => ok({ generation: 1 }));
    await share.cancelAllLinks();
    expect(calls[0]!.url).toBe("http://127.0.0.1:1234/share/p1/reset");
  });

  it("says what went wrong in words", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const forbidden = client(() => new Response("{}", { status: 403 }));
    await expect(forbidden.share.makeLink("editor")).rejects.toThrow(
      /did not start sharing/,
    );
    const missing = client(() => new Response("{}", { status: 404 }));
    await expect(missing.share.cancelAllLinks()).rejects.toThrow(
      /Nothing is shared/,
    );
    const broken = client(() => new Response("{}", { status: 500 }));
    await expect(broken.share.makeLink("editor")).rejects.toThrow(
      /answered 500/,
    );
    const down = client(() => {
      throw new TypeError("fetch failed");
    });
    await expect(down.share.makeLink("editor")).rejects.toThrow(
      /Could not reach the collab server/,
    );
    await expect(down.share.makeLink("editor")).rejects.toBeInstanceOf(
      ShareError,
    );
  });

  it("an answer that is not understood is an error, not a crash", async () => {
    const { share } = client(() => ok({ nope: true }));
    await expect(share.makeLink("editor")).rejects.toThrow(/not understood/);
    await expect(share.cancelAllLinks()).rejects.toThrow(/not understood/);
  });
});
