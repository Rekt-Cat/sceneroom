import { describe, expect, it } from "vitest";
import { createEmptyScene, sceneSchema } from "./scene";
import {
  addNode,
  createNode,
  duplicateNode,
  duplicateNodes,
  getSubtreeIds,
  removeNode,
  removeNodes,
  setTransform,
  setTransforms,
  transformsEqual,
  uniqueCopyName,
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
      name: "Sphere (1)",
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
    expect(copy?.name).toBe("Cone (1)");
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

describe("uniqueCopyName", () => {
  function sceneWithNames(...names: string[]) {
    let scene = createEmptyScene();
    names.forEach((name, i) => {
      scene = addNode(scene, { ...createNode(`n${i}`, "cube"), name });
    });
    return scene;
  }

  it("adds (1) to a name that has no copies yet", () => {
    expect(uniqueCopyName(sceneWithNames("Cube"), "Cube")).toBe("Cube (1)");
  });

  it("counts up: (2), (3), ...", () => {
    const scene = sceneWithNames("Cube", "Cube (1)");
    expect(uniqueCopyName(scene, "Cube")).toBe("Cube (2)");
    const more = sceneWithNames("Cube", "Cube (1)", "Cube (2)");
    expect(uniqueCopyName(more, "Cube")).toBe("Cube (3)");
  });

  it("duplicating a numbered copy continues the numbering instead of stacking", () => {
    const scene = sceneWithNames("Cube", "Cube (1)");
    expect(uniqueCopyName(scene, "Cube (1)")).toBe("Cube (2)");
  });

  it("fills the lowest free number", () => {
    const scene = sceneWithNames("Cube", "Cube (2)");
    expect(uniqueCopyName(scene, "Cube")).toBe("Cube (1)");
  });

  it("does not treat a name like (1) with no base as a suffix", () => {
    expect(uniqueCopyName(sceneWithNames("(1)"), "(1)")).toBe("(1) (1)");
  });

  it("shortens a very long base name to stay within the limit", () => {
    const long = "x".repeat(100);
    const result = uniqueCopyName(sceneWithNames(long), long);
    expect(result).toBe("x".repeat(96) + " (1)");
    expect(result).toHaveLength(100);
  });
});

describe("removeNodes", () => {
  it("removes several nodes, including ones whose parent was removed too", () => {
    const next = removeNodes(sceneWithTree(), ["c", "a", "gone"]);
    expect(Object.keys(next.nodes)).toEqual([]);
  });
});

describe("duplicateNodes", () => {
  function counter() {
    let n = 0;
    return () => `new${++n}`;
  }

  it("copies each selected node and returns the ids of the new top copies", () => {
    let scene = sceneWithTree();
    scene = addNode(scene, createNode("d", "plane"));
    const result = duplicateNodes(scene, ["a", "d"], counter(), [1, 0, 0]);
    // a has 3 nodes below and including it (a, b, c), d has 1
    expect(Object.keys(result.scene.nodes)).toHaveLength(3 + 1 + 3 + 1);
    expect(result.rootIds).toHaveLength(2);
    expect(result.scene.nodes[result.rootIds[0]!]?.name).toBe("Cube (1)");
    expect(result.scene.nodes[result.rootIds[1]!]?.name).toBe("Plane (1)");
  });

  it("does not copy a child twice when its parent is selected as well", () => {
    const result = duplicateNodes(sceneWithTree(), ["a", "b"], counter());
    expect(Object.keys(result.scene.nodes)).toHaveLength(6);
    expect(result.rootIds).toHaveLength(1);
  });

  it("numbers several copies of the same name one after another", () => {
    let scene = createEmptyScene();
    scene = addNode(scene, createNode("x", "cube"));
    scene = addNode(scene, { ...createNode("y", "cube"), name: "Cube" });
    const names = Object.values(
      duplicateNodes(scene, ["x", "y"], counter()).scene.nodes,
    ).map((node) => node.name);
    expect(names).toContain("Cube (1)");
    expect(names).toContain("Cube (2)");
  });
});

describe("setTransforms", () => {
  it("sets the transform of several nodes at once", () => {
    const next = setTransforms(sceneWithTree(), {
      a: { position: [1, 1, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
      b: { position: [2, 2, 2], rotation: [0, 0, 0], scale: [1, 1, 1] },
    });
    expect(next.nodes["a"]?.transform.position).toEqual([1, 1, 1]);
    expect(next.nodes["b"]?.transform.position).toEqual([2, 2, 2]);
  });
});

describe("transformsEqual", () => {
  const base = createNode("a", "cube").transform;

  it("is true for the same numbers, even in different objects", () => {
    expect(transformsEqual(base, { ...base })).toBe(true);
    expect(
      transformsEqual(base, {
        position: [...base.position],
        rotation: [...base.rotation],
        scale: [...base.scale],
      }),
    ).toBe(true);
  });

  it("is false when any single number differs", () => {
    expect(transformsEqual(base, { ...base, position: [0, 0.5, 0.001] })).toBe(
      false,
    );
    expect(transformsEqual(base, { ...base, rotation: [0, 0, 1] })).toBe(false);
    expect(transformsEqual(base, { ...base, scale: [1, 1, 2] })).toBe(false);
  });
});
