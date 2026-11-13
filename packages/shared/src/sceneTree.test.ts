import { describe, expect, it } from "vitest";
import { createEmptyScene } from "./scene";
import { addNode, createNode } from "./sceneOps";
import {
  buildSceneTree,
  editableIds,
  flattenTree,
  isEffectivelyLocked,
  isEffectivelyVisible,
  searchNodes,
} from "./sceneTree";

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

describe("searchNodes", () => {
  function namedScene() {
    let scene = createEmptyScene();
    scene = addNode(scene, { ...createNode("a", "cube"), name: "Crate" });
    scene = addNode(scene, { ...createNode("b", "cube"), name: "Crate (1)" });
    scene = addNode(scene, { ...createNode("c", "cone"), name: "Lamp" });
    return scene;
  }

  it("returns null for an empty or blank search, meaning no filter", () => {
    expect(searchNodes(namedScene(), "")).toBeNull();
    expect(searchNodes(namedScene(), "   ")).toBeNull();
  });

  it("matches part of a name, ignoring case and surrounding spaces", () => {
    const ids = (q: string) => searchNodes(namedScene(), q)?.map((n) => n.id);
    expect(ids("crate")).toEqual(["a", "b"]);
    expect(ids("  LAM ")).toEqual(["c"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(searchNodes(namedScene(), "zzz")).toEqual([]);
  });
});

describe("isEffectivelyVisible", () => {
  it("is true when the node and all its parents are visible", () => {
    expect(isEffectivelyVisible(sampleScene(), "c")).toBe(true);
  });

  it("is false when the node itself is hidden", () => {
    const scene = sampleScene();
    const hidden = {
      ...scene,
      nodes: { ...scene.nodes, c: { ...scene.nodes["c"]!, visible: false } },
    };
    expect(isEffectivelyVisible(hidden, "c")).toBe(false);
    expect(isEffectivelyVisible(hidden, "b")).toBe(true);
  });

  it("is false when any parent above it is hidden", () => {
    const scene = sampleScene();
    const hidden = {
      ...scene,
      nodes: { ...scene.nodes, a: { ...scene.nodes["a"]!, visible: false } },
    };
    expect(isEffectivelyVisible(hidden, "c")).toBe(false);
    expect(isEffectivelyVisible(hidden, "e")).toBe(true);
  });

  it("is false for an unknown node", () => {
    expect(isEffectivelyVisible(sampleScene(), "nope")).toBe(false);
  });
});

describe("isEffectivelyLocked and editableIds", () => {
  function lockedScene(lockedId: string) {
    const scene = sampleScene();
    return {
      ...scene,
      nodes: {
        ...scene.nodes,
        [lockedId]: { ...scene.nodes[lockedId]!, locked: true },
      },
    };
  }

  it("is false when nothing is locked", () => {
    expect(isEffectivelyLocked(sampleScene(), "c")).toBe(false);
  });

  it("is true for a locked node and for everything inside it", () => {
    const scene = lockedScene("b");
    expect(isEffectivelyLocked(scene, "b")).toBe(true);
    expect(isEffectivelyLocked(scene, "c")).toBe(true);
    expect(isEffectivelyLocked(scene, "a")).toBe(false);
    expect(isEffectivelyLocked(scene, "d")).toBe(false);
  });

  it("is false for an unknown node", () => {
    expect(isEffectivelyLocked(sampleScene(), "nope")).toBe(false);
  });

  it("editableIds keeps only known, unlocked nodes, in order", () => {
    const scene = lockedScene("b");
    expect(editableIds(scene, ["c", "a", "nope", "d", "b"])).toEqual([
      "a",
      "d",
    ]);
  });
});
