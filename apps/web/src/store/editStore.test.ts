import { beforeEach, describe, expect, it } from "vitest";
import { activeOperation, useEditStore } from "./editStore";
import type { ShapeMesh } from "@sceneroom/shared";

beforeEach(() => {
  useEditStore.setState(useEditStore.getInitialState(), true);
});

describe("edit mode selection mode", () => {
  it("starts on points, and the mode is kept when the selection is kept", () => {
    expect(useEditStore.getState().selectMode).toBe("point");
    useEditStore.getState().enter("a");
    useEditStore.getState().setSelected([1, 2, 3]);
    useEditStore.getState().setSelectMode("edge");
    expect(useEditStore.getState().selected).toEqual([1, 2, 3]);
    expect(useEditStore.getState().selectMode).toBe("edge");
  });

  it("the mode stays when edit mode is left and entered again", () => {
    useEditStore.getState().enter("a");
    useEditStore.getState().setSelectMode("face");
    useEditStore.getState().exit();
    useEditStore.getState().enter("b");
    expect(useEditStore.getState().selectMode).toBe("face");
    expect(useEditStore.getState().selected).toEqual([]);
  });
});

describe("the settings panel under the edit bar", () => {
  const before: ShapeMesh = {
    positions: new Float32Array(0),
    indices: new Uint32Array(0),
  };

  it("is shown for every operation that has one (a missing one would never appear)", () => {
    const edit = () => useEditStore.getState();
    expect(activeOperation(edit())).toBeNull();
    edit().setDivide({
      before,
      selectedBefore: [],
      cuts: 0,
      applied: false,
      pastLength: 4,
    });
    expect(activeOperation(edit())?.pastLength).toBe(4);
    edit().setDivide(null);
    edit().setBevel({
      before,
      edges: [],
      width: 1,
      defaultWidth: 1,
      maxWidth: 2,
      segments: 1,
      pastLength: 5,
    });
    expect(activeOperation(edit())?.pastLength).toBe(5);
    edit().setBevel(null);
    edit().setLoopCut({
      before,
      edge: [0, 1],
      options: { cuts: 1, slide: 0 },
      pastLength: 6,
    });
    expect(activeOperation(edit())?.pastLength).toBe(6);
    edit().setLoopCut(null);
    edit().setExtrude({
      kind: "extrude",
      before,
      selectedBefore: [],
      distance: 1,
      defaultDistance: 1,
      options: { divisions: 1, scale: 1, twistDegrees: 0 },
      defaultOptions: { divisions: 1, scale: 1, twistDegrees: 0 },
      pastLength: 7,
    });
    expect(activeOperation(edit())?.pastLength).toBe(7);
  });
});
