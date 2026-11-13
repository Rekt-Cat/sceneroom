import { describe, expect, it } from "vitest";
import { createEmptyScene, sceneSchema } from "./scene";
import {
  addNode,
  createNode,
  duplicateNode,
  getSubtreeIds,
  removeNode,
  setTransform,
  updateNode,
} from "./sceneOps";

function sceneWithTree() {
  // a
  // └─ b
  //    └─ c
  let scene = createEmptyScene();
  scene = addNode(scene, createNode("a", "cube"));
  scene = addNode(scene, { ...createNode("b", "sphere"), parentId: "a" });
  scene = addNode(scene, { ...createNode("c", "cone"), parentId: "b" });
  return scene;
}

describe("addNode", () => {
  it("adds a node and does not change the original scene", () => {
    const empty = createEmptyScene();
    const next = addNode(empty, createNode("a", "cube"));
    expect(Object.keys(next.nodes)).toEqual(["a"]);
    expect(Object.keys(empty.nodes)).toEqual([]);
  });

  it("rejects a duplicate id and a missing parent", () => {
    const scene = sceneWithTree();
    expect(() => addNode(scene, createNode("a", "cube"))).toThrow(
      "already exists",
    );
    expect(() =>
      addNode(scene, { ...createNode("z", "cube"), parentId: "nope" }),
    ).toThrow("does not exist");
  });

  it("produces scenes that pass the schema", () => {
    expect(sceneSchema.safeParse(sceneWithTree()).success).toBe(true);
  });
});

describe("removeNode", () => {
  it("removes the node and all its descendants", () => {
    expect(Object.keys(removeNode(sceneWithTree(), "b").nodes)).toEqual(["a"]);
  });

  it("ignores an unknown id", () => {
    const scene = sceneWithTree();
    expect(removeNode(scene, "nope")).toBe(scene);
  });
});

describe("duplicateNode", () => {
  it("copies the subtree with new ids and keeps the copied hierarchy", () => {
    const next = duplicateNode(sceneWithTree(), "b", ["b2", "c2"]);
    expect(next.nodes["b2"]).toMatchObject({
      name: "Sphere copy",
      parentId: "a",
    });
    expect(next.nodes["c2"]).toMatchObject({ parentId: "b2" });
    expect(getSubtreeIds(next, "a")).toHaveLength(5);
  });

  it("moves only the top copy by the offset", () => {
    const next = duplicateNode(sceneWithTree(), "b", ["b2", "c2"], [1, 0, 2]);
    expect(next.nodes["b2"]?.transform.position).toEqual([1, 0.5, 2]);
    expect(next.nodes["c2"]?.transform.position).toEqual([0, 0.5, 0]);
    // the original is untouched
    expect(next.nodes["b"]?.transform.position).toEqual([0, 0.5, 0]);
  });

  it("keeps the copy's name within the allowed length", () => {
    const scene = updateNode(sceneWithTree(), "a", { name: "x".repeat(100) });
    const copy = duplicateNode(scene, "c", ["c2"]).nodes["c2"];
    expect(
      sceneSchema.safeParse(duplicateNode(scene, "a", ["a2", "b2", "c2"]))
        .success,
    ).toBe(true);
    expect(copy?.name).toBe("Cone copy");
  });

  it("requires one new id per copied node", () => {
    expect(() => duplicateNode(sceneWithTree(), "b", ["b2"])).toThrow(
      "Expected 2 new ids",
    );
  });
});

describe("updateNode and setTransform", () => {
  it("renames a node", () => {
    expect(
      updateNode(sceneWithTree(), "a", { name: "Box" }).nodes["a"]?.name,
    ).toBe("Box");
  });

  it("sets a transform", () => {
    const next = setTransform(sceneWithTree(), "a", {
      position: [1, 2, 3],
      rotation: [0, 1, 0],
      scale: [2, 2, 2],
    });
    expect(next.nodes["a"]?.transform.position).toEqual([1, 2, 3]);
  });

  it("throws for an unknown node", () => {
    expect(() => updateNode(sceneWithTree(), "nope", { name: "x" })).toThrow(
      "does not exist",
    );
  });
});
