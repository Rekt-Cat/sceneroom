import { describe, expect, it } from "vitest";
import { createEmptyScene } from "./scene";
import { addNode, createNode, removeNode } from "./sceneOps";
import {
  rangeBetween,
  resolveSelection,
  toggleInSelection,
  topLevelSelection,
} from "./selection";

function sceneWithTree() {
  // a
  // └─ b
  //    └─ c
  // d
  let scene = createEmptyScene();
  scene = addNode(scene, createNode("a", "cube"));
  scene = addNode(scene, { ...createNode("b", "sphere"), parentId: "a" });
  scene = addNode(scene, { ...createNode("c", "cone"), parentId: "b" });
  scene = addNode(scene, createNode("d", "plane"));
  return scene;
}

describe("resolveSelection", () => {
  const scene = sceneWithTree();

  it("keeps ids that exist, in order, without repeats", () => {
    expect(resolveSelection(scene, ["d", "a", "d"])).toEqual(["d", "a"]);
  });

  it("drops unknown ids and works for an empty list", () => {
    expect(resolveSelection(scene, ["nope", "a"])).toEqual(["a"]);
    expect(resolveSelection(scene, [])).toEqual([]);
  });

  it("drops ids of removed nodes", () => {
    expect(resolveSelection(removeNode(scene, "a"), ["a", "b", "d"])).toEqual([
      "d",
    ]);
  });
});

describe("toggleInSelection", () => {
  it("adds an id that is not selected and removes one that is", () => {
    expect(toggleInSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleInSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("does not change the list it was given", () => {
    const ids = ["a"];
    toggleInSelection(ids, "b");
    expect(ids).toEqual(["a"]);
  });
});

describe("topLevelSelection", () => {
  const scene = sceneWithTree();

  it("removes nodes whose parent or grandparent is also selected", () => {
    expect(topLevelSelection(scene, ["a", "b", "c", "d"])).toEqual(["a", "d"]);
    expect(topLevelSelection(scene, ["a", "c"])).toEqual(["a"]);
  });

  it("keeps a child whose parent is not selected", () => {
    expect(topLevelSelection(scene, ["b", "d"])).toEqual(["b", "d"]);
  });
});

describe("rangeBetween", () => {
  const rows = ["a", "b", "c", "d", "e"];

  it("gives everything from the anchor to the target, both included", () => {
    expect(rangeBetween(rows, "b", "d")).toEqual(["b", "c", "d"]);
  });

  it("works the same when the target is above the anchor", () => {
    expect(rangeBetween(rows, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("anchor and target the same row gives just that row", () => {
    expect(rangeBetween(rows, "c", "c")).toEqual(["c"]);
  });

  it("with no anchor, or an anchor that is not in the list, it is just the target", () => {
    expect(rangeBetween(rows, null, "c")).toEqual(["c"]);
    expect(rangeBetween(rows, "gone", "c")).toEqual(["c"]);
  });

  it("an unknown target gives nothing, and the list is not changed", () => {
    expect(rangeBetween(rows, "a", "gone")).toEqual([]);
    expect(rows).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("covers the whole list from the first to the last row", () => {
    expect(rangeBetween(rows, "a", "e")).toEqual(rows);
  });
});
