import { describe, expect, it } from "vitest";
import {
  createEmptyScene,
  sceneNodeSchema,
  sceneSchema,
  type Scene,
} from "./scene";
import { addNode, createNode, duplicateNode, getSubtreeIds } from "./sceneOps";
import { buildSceneTree } from "./sceneTree";
import { reparentNodes } from "./reparent";
import {
  childrenOf,
  dropPlacement,
  nextOrder,
  placeAmongSiblings,
  stepPlacement,
} from "./siblingOrder";

/**
 * Top level: a, b, c (in that order)
 *   a has children a1, a2
 */
function sample(): Scene {
  let scene = createEmptyScene();
  for (const id of ["a", "b", "c"])
    scene = addNode(scene, createNode(id, "cube"));
  scene = addNode(scene, { ...createNode("a1", "sphere"), parentId: "a" });
  scene = addNode(scene, { ...createNode("a2", "sphere"), parentId: "a" });
  return scene;
}
const ids = (scene: Scene, parentId: string | null) =>
  childrenOf(scene, parentId).map((n) => n.id);
const t = (scene: Scene, id: string) => scene.nodes[id]!.transform;

describe("order of siblings", () => {
  it("new objects go after the others, in whatever parent", () => {
    const scene = sample();
    expect(ids(scene, null)).toEqual(["a", "b", "c"]);
    expect(ids(scene, "a")).toEqual(["a1", "a2"]);
    expect(nextOrder(scene, null)).toBe(3);
    expect(nextOrder(scene, "b")).toBe(0);
  });

  it("a scene saved before order existed keeps its creation order (every order is 0)", () => {
    const { order, ...old } = createNode("x", "cube");
    void order;
    const parsed = sceneSchema.parse({
      version: 1,
      nodes: {
        x: old,
        y: { ...old, id: "y" },
        z: { ...old, id: "z" },
      },
    });
    expect(ids(parsed, null)).toEqual(["x", "y", "z"]);
    expect(sceneNodeSchema.parse(old).order).toBe(0);
  });

  it("the tree follows the order", () => {
    const moved = placeAmongSiblings(sample(), "c", "a");
    expect(buildSceneTree(moved).map((entry) => entry.node.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(
      buildSceneTree(moved)[1]?.children.map((entry) => entry.node.id),
    ).toEqual(["a1", "a2"]);
  });

  it("a subtree lists its children in display order (so copies come out in the order they are shown)", () => {
    const reordered = placeAmongSiblings(sample(), "a2", "a1");
    expect(getSubtreeIds(reordered, "a")).toEqual(["a", "a2", "a1"]);
    const copy = duplicateNode(reordered, "a", ["n1", "n2", "n3"]);
    expect(copy.nodes["n2"]?.name).toBe(reordered.nodes["a2"]?.name);
  });
});

describe("placeAmongSiblings", () => {
  it("moves a node before another, and the others close up", () => {
    expect(ids(placeAmongSiblings(sample(), "c", "a"), null)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(ids(placeAmongSiblings(sample(), "a", "c"), null)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("null (or an unknown id) means the end", () => {
    expect(ids(placeAmongSiblings(sample(), "a", null), null)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(ids(placeAmongSiblings(sample(), "a", "nope"), null)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("returns the very same scene when nothing would change", () => {
    const scene = sample();
    expect(placeAmongSiblings(scene, "b", "c")).toBe(scene); // already just before c
    expect(placeAmongSiblings(scene, "c", null)).toBe(scene); // already last
    expect(placeAmongSiblings(scene, "a", "a")).toBe(scene);
    expect(placeAmongSiblings(scene, "gone", null)).toBe(scene);
  });

  it("only changes the order of the objects in that parent", () => {
    const moved = placeAmongSiblings(sample(), "a2", "a1");
    expect(ids(moved, "a")).toEqual(["a2", "a1"]);
    expect(ids(moved, null)).toEqual(["a", "b", "c"]);
  });

  it("does not change the scene it was given", () => {
    const scene = sample();
    placeAmongSiblings(scene, "c", "a");
    expect(ids(scene, null)).toEqual(["a", "b", "c"]);
  });
});

describe("reparentNodes with a place", () => {
  it("puts a moved object just before the one given, in the new parent", () => {
    const scene = sample();
    const moved = reparentNodes(scene, [
      { id: "c", parentId: "a", transform: t(scene, "c"), beforeId: "a2" },
    ]);
    expect(ids(moved, "a")).toEqual(["a1", "c", "a2"]);
    expect(ids(moved, null)).toEqual(["a", "b"]);
  });

  it("puts it first in a parent: right under the parent", () => {
    const scene = sample();
    const moved = reparentNodes(scene, [
      { id: "c", parentId: "a", transform: t(scene, "c"), beforeId: "a1" },
    ]);
    expect(ids(moved, "a")).toEqual(["c", "a1", "a2"]);
  });

  it("without a place, an object that changes parent goes to the end of the new parent", () => {
    const scene = sample();
    const moved = reparentNodes(scene, [
      { id: "c", parentId: "a", transform: t(scene, "c") },
    ]);
    expect(ids(moved, "a")).toEqual(["a1", "a2", "c"]);
  });

  it("reorders inside the same parent when given a place, without touching the transform", () => {
    const scene = sample();
    const moved = reparentNodes(scene, [
      { id: "c", parentId: null, transform: t(scene, "c"), beforeId: "a" },
    ]);
    expect(ids(moved, null)).toEqual(["c", "a", "b"]);
    expect(moved.nodes["c"]?.transform).toBe(scene.nodes["c"]?.transform);
  });

  it("a move that changes nothing leaves every object as it was (same objects, not copies)", () => {
    const scene = sample();
    const same = reparentNodes(scene, [
      { id: "b", parentId: null, transform: t(scene, "b"), beforeId: "c" },
    ]);
    for (const id of Object.keys(scene.nodes)) {
      expect(same.nodes[id]).toBe(scene.nodes[id]);
    }
  });

  it("several moves with the same place end up in the order given", () => {
    const scene = sample();
    const moved = reparentNodes(scene, [
      { id: "b", parentId: "a", transform: t(scene, "b"), beforeId: "a2" },
      { id: "c", parentId: "a", transform: t(scene, "c"), beforeId: "a2" },
    ]);
    expect(ids(moved, "a")).toEqual(["a1", "b", "c", "a2"]);
  });

  it("still refuses a loop", () => {
    const scene = sample();
    expect(() =>
      reparentNodes(scene, [
        { id: "a", parentId: "a1", transform: t(scene, "a"), beforeId: null },
      ]),
    ).toThrow("Cannot move");
  });
});

describe("dropPlacement", () => {
  const scene = sample();

  it("into: the end of that row's children", () => {
    expect(dropPlacement(scene, "b", "into", false)).toEqual({
      parentId: "b",
      beforeId: null,
    });
  });

  it("before: just before that row, in its parent", () => {
    expect(dropPlacement(scene, "b", "before", false)).toEqual({
      parentId: null,
      beforeId: "b",
    });
    expect(dropPlacement(scene, "a2", "before", false)).toEqual({
      parentId: "a",
      beforeId: "a2",
    });
  });

  it("after a row with no open children: just after it, in its parent", () => {
    expect(dropPlacement(scene, "b", "after", false)).toEqual({
      parentId: null,
      beforeId: "c",
    });
    expect(dropPlacement(scene, "c", "after", false)).toEqual({
      parentId: null,
      beforeId: null,
    });
    expect(dropPlacement(scene, "a1", "after", false)).toEqual({
      parentId: "a",
      beforeId: "a2",
    });
  });

  it("after an OPEN parent: its first child, the place right under it", () => {
    expect(dropPlacement(scene, "a", "after", true)).toEqual({
      parentId: "a",
      beforeId: "a1",
    });
  });

  it("after a CLOSED parent: after it, as a sibling", () => {
    expect(dropPlacement(scene, "a", "after", false)).toEqual({
      parentId: null,
      beforeId: "b",
    });
  });

  it("after an open row that has no children is just after it", () => {
    expect(dropPlacement(scene, "b", "after", true)).toEqual({
      parentId: null,
      beforeId: "c",
    });
  });

  it("an unknown row gives nothing", () => {
    expect(dropPlacement(scene, "gone", "into", false)).toBeNull();
  });
});

describe("stepPlacement (Move up and Move down)", () => {
  const scene = sample();

  it("up goes before the previous sibling; the first one cannot go up", () => {
    expect(stepPlacement(scene, "c", "up")).toEqual({
      parentId: null,
      beforeId: "b",
    });
    expect(stepPlacement(scene, "a", "up")).toBeNull();
  });

  it("down goes before the sibling after the next one, or to the end", () => {
    expect(stepPlacement(scene, "a", "down")).toEqual({
      parentId: null,
      beforeId: "c",
    });
    expect(stepPlacement(scene, "b", "down")).toEqual({
      parentId: null,
      beforeId: null,
    });
    expect(stepPlacement(scene, "c", "down")).toBeNull();
  });

  it("works inside a parent, and moving steps really swaps neighbours", () => {
    expect(stepPlacement(scene, "a1", "down")).toEqual({
      parentId: "a",
      beforeId: null,
    });
    const down = stepPlacement(scene, "a", "down")!;
    const moved = placeAmongSiblings(scene, "a", down.beforeId);
    expect(ids(moved, null)).toEqual(["b", "a", "c"]);
    const up = stepPlacement(moved, "a", "up")!;
    expect(ids(placeAmongSiblings(moved, "a", up.beforeId), null)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
