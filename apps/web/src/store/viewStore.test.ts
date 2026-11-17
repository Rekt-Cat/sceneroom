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
