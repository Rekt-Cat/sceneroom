import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectionToken,
  forgetConnection,
  isAccountConnection,
  loadConnection,
  saveConnection,
} from "./savedConnection";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

describe("saved connections", () => {
  it("keeps a link connection (server and token) and an account connection (server only)", () => {
    saveConnection("p1", { url: "ws://127.0.0.1:1234", token: "tok" });
    saveConnection("p2", { kind: "account", url: "ws://127.0.0.1:1234" });
    expect(loadConnection("p1")).toEqual({
      url: "ws://127.0.0.1:1234",
      token: "tok",
    });
    expect(loadConnection("p2")).toEqual({
      kind: "account",
      url: "ws://127.0.0.1:1234",
    });
    forgetConnection("p1");
    expect(loadConnection("p1")).toBeNull();
  });

  it("an account connection keeps no token anywhere", () => {
    saveConnection("p2", { kind: "account", url: "ws://127.0.0.1:1234" });
    expect(
      window.localStorage.getItem("sceneroom-collab-link:p2"),
    ).not.toContain("token");
  });

  it("ignores saved data that is not one of the two shapes", () => {
    window.localStorage.setItem(
      "sceneroom-collab-link:bad",
      JSON.stringify({ kind: "other", url: "ws://x" }),
    );
    window.localStorage.setItem(
      "sceneroom-collab-link:bad2",
      JSON.stringify({ url: "http://not-websocket", token: "t" }),
    );
    window.localStorage.setItem("sceneroom-collab-link:bad3", "not json");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(loadConnection("bad")).toBeNull();
    expect(loadConnection("bad2")).toBeNull();
    expect(loadConnection("bad3")).toBeNull();
  });

  it("the token for a link is the link's own; for an account it is a source that asks the web app", async () => {
    const link = { url: "ws://127.0.0.1:1234", token: "tok" };
    const account = { kind: "account" as const, url: "ws://127.0.0.1:1234" };
    expect(isAccountConnection(link)).toBe(false);
    expect(isAccountConnection(account)).toBe(true);
    expect(connectionToken("p", link)).toBe("tok");
    expect(connectionToken("p", account)).toMatchObject({
      fresh: expect.any(Function),
      cached: expect.any(Function),
    });
  });
});
