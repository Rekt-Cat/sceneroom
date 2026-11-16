import { beforeEach, describe, expect, it } from "vitest";
import { useEditStore } from "./editStore";

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
