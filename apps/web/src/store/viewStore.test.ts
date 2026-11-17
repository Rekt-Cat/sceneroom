import { beforeEach, describe, expect, it } from "vitest";
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
