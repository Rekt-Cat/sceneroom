import { describe, expect, it } from "vitest";
import { createEmptyScene, type Transform } from "./scene";
import { addNode, createNode } from "./sceneOps";
import {
  canReparent,
  isInSubtree,
  movableSelection,
  reparentNodes,
} from "./reparent";

function sampleScene() {
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

const moved: Transform = {
  position: [5, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

describe("isInSubtree", () => {
  const scene = sampleScene();
  it("is true for the node itself and anything below it", () => {
    expect(isInSubtree(scene, "a", "a")).toBe(true);
    expect(isInSubtree(scene, "c", "a")).toBe(true);
    expect(isInSubtree(scene, "c", "b")).toBe(true);
  });
  it("is false for siblings, parents and unknown nodes", () => {
    expect(isInSubtree(scene, "d", "a")).toBe(false);
    expect(isInSubtree(scene, "a", "c")).toBe(false);
    expect(isInSubtree(scene, "nope", "a")).toBe(false);
  });
});

describe("canReparent", () => {
  const scene = sampleScene();

  it("allows moving to the top level and under an unrelated node", () => {
    expect(canReparent(scene, "c", null)).toBe(true);
    expect(canReparent(scene, "d", "c")).toBe(true);
    expect(canReparent(scene, "c", "d")).toBe(true);
  });

  it("refuses an object under itself or under something below it", () => {
    expect(canReparent(scene, "a", "a")).toBe(false);
    expect(canReparent(scene, "a", "b")).toBe(false);
    expect(canReparent(scene, "a", "c")).toBe(false);
  });

  it("refuses unknown objects and unknown parents", () => {
    expect(canReparent(scene, "nope", null)).toBe(false);
    expect(canReparent(scene, "a", "nope")).toBe(false);
  });
});

describe("movableSelection", () => {
  const scene = sampleScene();

  it("keeps only the top objects of the selection", () => {
    expect(movableSelection(scene, ["a", "b", "d"], null)).toEqual(["a", "d"]);
  });

  it("is empty if any of them cannot go there", () => {
    // d is fine under c, but a cannot go under its own child c
    expect(movableSelection(scene, ["a", "d"], "c")).toEqual([]);
  });
});

describe("reparentNodes", () => {
  it("sets the new parent and transform", () => {
    const next = reparentNodes(sampleScene(), [
      { id: "d", parentId: "b", transform: moved },
    ]);
    expect(next.nodes["d"]).toMatchObject({ parentId: "b", transform: moved });
  });

  it("can move to the top level", () => {
    const next = reparentNodes(sampleScene(), [
      { id: "c", parentId: null, transform: moved },
    ]);
    expect(next.nodes["c"]?.parentId).toBeNull();
  });

  it("does not change the scene it was given", () => {
    const scene = sampleScene();
    reparentNodes(scene, [{ id: "d", parentId: "a", transform: moved }]);
    expect(scene.nodes["d"]?.parentId).toBeNull();
  });

  it("throws on a loop and leaves nothing half done", () => {
    const scene = sampleScene();
    expect(() =>
      reparentNodes(scene, [
        { id: "d", parentId: "a", transform: moved },
        { id: "a", parentId: "c", transform: moved }, // a under its own grandchild
      ]),
    ).toThrow("Cannot move");
    expect(scene.nodes["d"]?.parentId).toBeNull();
  });

  it("checks each move against the scene as it is by then", () => {
    // After d goes under a, moving a under d would be a loop
    expect(() =>
      reparentNodes(sampleScene(), [
        { id: "d", parentId: "a", transform: moved },
        { id: "a", parentId: "d", transform: moved },
      ]),
    ).toThrow();
  });
});
