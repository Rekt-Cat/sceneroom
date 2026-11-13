import { describe, expect, it } from "vitest";
import { createEmptyScene } from "./scene";
import { addNode, createNode } from "./sceneOps";
import { buildSceneTree, flattenTree } from "./sceneTree";

function sampleScene() {
  // a
  // ├─ b
  // │  └─ c
  // └─ d
  // e
  let scene = createEmptyScene();
  scene = addNode(scene, createNode("a", "cube"));
  scene = addNode(scene, { ...createNode("b", "sphere"), parentId: "a" });
  scene = addNode(scene, { ...createNode("c", "cone"), parentId: "b" });
  scene = addNode(scene, { ...createNode("d", "plane"), parentId: "a" });
  scene = addNode(scene, createNode("e", "cylinder"));
  return scene;
}

describe("buildSceneTree", () => {
  it("builds the tree from parentId, keeping scene order", () => {
    const tree = buildSceneTree(sampleScene());
    expect(tree.map((t) => t.node.id)).toEqual(["a", "e"]);
    expect(tree[0]?.children.map((t) => t.node.id)).toEqual(["b", "d"]);
    expect(tree[0]?.children[0]?.children.map((t) => t.node.id)).toEqual(["c"]);
  });

  it("is empty for an empty scene", () => {
    expect(buildSceneTree(createEmptyScene())).toEqual([]);
  });

  it("shows a node with a missing parent at the top level instead of losing it", () => {
    const scene = sampleScene();
    const broken = {
      ...scene,
      nodes: { ...scene.nodes, c: { ...scene.nodes["c"]!, parentId: "gone" } },
    };
    expect(buildSceneTree(broken).map((t) => t.node.id)).toEqual([
      "a",
      "c",
      "e",
    ]);
  });
});

describe("flattenTree", () => {
  const tree = buildSceneTree(sampleScene());

  it("lists every node top to bottom with its depth", () => {
    const rows = flattenTree(tree, new Set());
    expect(rows.map((r) => [r.node.id, r.depth])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
      ["d", 1],
      ["e", 0],
    ]);
  });

  it("leaves out the children of collapsed nodes", () => {
    const rows = flattenTree(tree, new Set(["a"]));
    expect(rows.map((r) => r.node.id)).toEqual(["a", "e"]);
    expect(rows[0]).toMatchObject({ hasChildren: true, expanded: false });
  });

  it("marks leaves as having no children and not expanded", () => {
    const rows = flattenTree(tree, new Set());
    expect(rows.find((r) => r.node.id === "e")).toMatchObject({
      hasChildren: false,
      expanded: false,
    });
  });
});
