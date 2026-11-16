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
