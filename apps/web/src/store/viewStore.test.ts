import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PEEK_TILES } from "@sceneroom/shared";
import { useViewStore } from "./viewStore";

beforeEach(() => {
  useViewStore.setState(useViewStore.getInitialState(), true);
});

describe("zoom requests to the 3D view", () => {
  it("starts with no request", () => {
    expect(useViewStore.getState().focusRequest).toBeNull();
  });

  it("asking for the same object twice is two requests, so the view moves again", () => {
    useViewStore.getState().requestFocus(["a"]);
    const first = useViewStore.getState().focusRequest;
    useViewStore.getState().requestFocus(["a"]);
    const second = useViewStore.getState().focusRequest;
    expect(second).not.toBe(first);
    expect(second!.seq).toBe(first!.seq + 1);
    expect(second!.ids).toEqual(["a"]);
  });
});

describe("flying the camera (right mouse button held)", () => {
  it("starts not flying", () => {
    expect(useViewStore.getState().flying).toBe(false);
    expect(useViewStore.getState().flewThisHold).toBe(false);
  });

  it("remembers that a fly key was used during the hold, and forgets it at the next hold", () => {
    useViewStore.getState().setFlying(true);
    useViewStore.getState().markFlew();
    useViewStore.getState().setFlying(false);
    // after letting go it is still marked, so the right-click menu knows not to open
    expect(useViewStore.getState().flewThisHold).toBe(true);
    useViewStore.getState().setFlying(true);
    expect(useViewStore.getState().flewThisHold).toBe(false);
  });
});

describe("the four-view peek", () => {
  it("starts hidden, showing top, front, right and perspective, with the normal view big", () => {
    const s = useViewStore.getState();
    expect(s.peekActive).toBe(false);
    expect(s.peekTiles).toEqual(["top", "front", "right", "perspective"]);
    expect(s.bigView).toBe("perspective");
    expect(s.peekHover).toBe(-1);
  });

  it("changes what one tile shows without touching the others", () => {
    useViewStore.getState().setPeekTile(2, "left");
    expect(useViewStore.getState().peekTiles).toEqual([
      "top",
      "front",
      "left",
      "perspective",
    ]);
    // an unknown tile is ignored
    useViewStore.getState().setPeekTile(9, "back");
    expect(useViewStore.getState().peekTiles).toEqual([
      "top",
      "front",
      "left",
      "perspective",
    ]);
  });

  it("forgets which tile the pointer was over when the views are hidden", () => {
    useViewStore.getState().setPeekActive(true);
    useViewStore.getState().setPeekHover(3);
    expect(useViewStore.getState().peekHover).toBe(3);
    useViewStore.getState().setPeekActive(false);
    expect(useViewStore.getState().peekHover).toBe(-1);
  });

  it("the big view can be set to a side and back", () => {
    useViewStore.getState().setBigView("right");
    expect(useViewStore.getState().bigView).toBe("right");
    useViewStore.getState().setBigView("perspective");
    expect(useViewStore.getState().bigView).toBe("perspective");
  });
});

/** A tiny stand-in for the browser's storage (the tests run without a browser). */
function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
  };
  return data;
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("the four-view choices are remembered", () => {
  it("saves a change of a tile, and reads it back the next time", () => {
    const data = stubStorage();
    useViewStore.getState().setPeekTile(1, "left");
    expect(JSON.parse(data.get("sceneroom.peekTiles.v1")!)).toEqual([
      "top",
      "left",
      "right",
      "perspective",
    ]);
    useViewStore.setState({ peekTiles: DEFAULT_PEEK_TILES });
    useViewStore.getState().hydratePeekTiles();
    expect(useViewStore.getState().peekTiles[1]).toBe("left");
  });

  it("keeps the starting views when the saved text is damaged or missing", () => {
    stubStorage({ "sceneroom.peekTiles.v1": "garbage" });
    useViewStore.getState().hydratePeekTiles();
    expect(useViewStore.getState().peekTiles).toEqual(DEFAULT_PEEK_TILES);
    stubStorage();
    useViewStore.getState().hydratePeekTiles();
    expect(useViewStore.getState().peekTiles).toEqual(DEFAULT_PEEK_TILES);
  });

  it("still works when the browser refuses to store anything", () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    };
    useViewStore.getState().setPeekTile(0, "back");
    expect(useViewStore.getState().peekTiles[0]).toBe("back");
    expect(() => useViewStore.getState().hydratePeekTiles()).not.toThrow();
  });
});
