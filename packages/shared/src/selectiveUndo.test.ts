import { describe, expect, it } from "vitest";
import {
  addNode,
  createEmptyScene,
  createNode,
  redoOwnChange,
  removeNode,
  setMaterial,
  setTransform,
  undoOwnChange,
  updateNode,
  type Scene,
} from "./index";
import { setEnvironment } from "./environment";

function base(): Scene {
  let scene = createEmptyScene();
  scene = addNode(scene, createNode("a", "cube"));
  scene = addNode(scene, createNode("b", "sphere"));
  return scene;
}

const moveTo = (scene: Scene, id: string, position: [number, number, number]) =>
  setTransform(scene, id, { ...scene.nodes[id]!.transform, position });

describe("undoOwnChange: only what my change did", () => {
  it("takes my change back when nobody else touched anything", () => {
    const before = base();
    const after = moveTo(before, "a", [5, 0, 0]);
    const result = undoOwnChange(after, { before, after });
    expect(result.scene).toEqual(before);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("leaves other people's changes alone: different fields of the same object", () => {
    const before = base();
    const after = moveTo(before, "a", [5, 0, 0]);
    // Meanwhile someone else recolours the same object and changes another one
    const current = updateNode(
      setMaterial(updateNode(after, "b", { name: "Theirs" }), "a", {
        roughness: 0.9,
      }),
      "a",
      { color: "#ff0000" },
    );
    const result = undoOwnChange(current, { before, after });
    expect(result.scene.nodes["a"]!.transform.position).toEqual([0, 0.5, 0]);
    expect(result.scene.nodes["a"]!.color).toBe("#ff0000");
    expect(result.scene.nodes["a"]!.material.roughness).toBe(0.9);
    expect(result.scene.nodes["b"]!.name).toBe("Theirs");
  });

  it("a field someone else changed after me is not touched (theirs wins)", () => {
    const before = base();
    const after = moveTo(before, "a", [5, 0, 0]);
    const current = moveTo(after, "a", [9, 9, 9]);
    const result = undoOwnChange(current, { before, after });
    expect(result.scene).toBe(current);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("undoing the creation of an object removes it (and its children)", () => {
    const before = base();
    const after = addNode(before, createNode("c", "cone"));
    const current = addNode(after, {
      ...createNode("d", "cube"),
      parentId: "c",
    });
    const result = undoOwnChange(current, { before, after });
    expect(result.scene.nodes["c"]).toBeUndefined();
    expect(result.scene.nodes["d"]).toBeUndefined();
    expect(result.scene.nodes["a"]).toBeDefined();
  });

  it("undoing a deletion brings the object back; its parent missing puts it at the top", () => {
    const withChild = addNode(base(), {
      ...createNode("c", "cone"),
      parentId: "a",
    });
    const afterDelete = removeNode(withChild, "c");
    expect(
      undoOwnChange(afterDelete, { before: withChild, after: afterDelete })
        .scene,
    ).toEqual(withChild);

    // Someone else deleted the parent meanwhile
    const parentGone = removeNode(afterDelete, "a");
    const restored = undoOwnChange(parentGone, {
      before: withChild,
      after: afterDelete,
    }).scene;
    expect(restored.nodes["c"]!.parentId).toBeNull();
  });

  it("an object someone else already deleted is skipped, not an error", () => {
    const before = base();
    const after = moveTo(before, "a", [5, 0, 0]);
    const current = removeNode(after, "a");
    const result = undoOwnChange(current, { before, after });
    expect(result.scene).toBe(current);
    expect(result.skipped).toBe(1);
  });

  it("a re-parenting that would make a loop is skipped", () => {
    const before = addNode(base(), {
      ...createNode("c", "cone"),
      parentId: "a",
    });
    // My change: move c out of a, to the top level
    const after = updateNodeParent(before, "c", null);
    // Meanwhile someone else puts a inside c (valid now that c is at the top)
    const current = updateNodeParent(after, "a", "c");
    const result = undoOwnChange(current, { before, after });
    expect(result.scene.nodes["c"]!.parentId).toBeNull(); // not put back under a: that would loop
    expect(result.skipped).toBe(1);
  });

  it("environment fields follow the same rule", () => {
    const before = base();
    const after = setEnvironment(before, { fogNear: 3, sunAzimuth: 100 });
    const current = setEnvironment(after, { sunAzimuth: 200 }); // someone else moved the sun
    const result = undoOwnChange(current, { before, after });
    expect(result.scene.environment.fogNear).toBe(before.environment.fogNear);
    expect(result.scene.environment.sunAzimuth).toBe(200);
  });

  it("files stay in the list either way (they are add-only online)", () => {
    const before = base();
    const info = {
      id: "f1",
      name: "tex",
      type: "texture" as const,
      bytes: 1,
      triangles: 0,
      boundsMin: [0, 0, 0] as [number, number, number],
      boundsMax: [1, 1, 1] as [number, number, number],
      note: "",
    };
    const after = {
      ...setMaterial(before, "a", { colorMap: "f1" }),
      assets: { f1: info },
    };
    const result = undoOwnChange(after, { before, after });
    expect(result.scene.nodes["a"]!.material.colorMap).toBeNull();
    expect(result.scene.assets["f1"]).toBeDefined();
  });
});

describe("redoOwnChange", () => {
  it("puts the change back after an undo, again leaving other people's work", () => {
    const before = base();
    const after = moveTo(before, "a", [5, 0, 0]);
    const undone = undoOwnChange(after, { before, after }).scene;
    const current = updateNode(undone, "b", { name: "Theirs" });
    const redone = redoOwnChange(current, { before, after });
    expect(redone.scene.nodes["a"]!.transform.position).toEqual([5, 0, 0]);
    expect(redone.scene.nodes["b"]!.name).toBe("Theirs");
  });

  it("is skipped where someone else changed the field in between", () => {
    const before = base();
    const after = moveTo(before, "a", [5, 0, 0]);
    const current = moveTo(before, "a", [7, 7, 7]); // after my Undo, they moved it
    const redone = redoOwnChange(current, { before, after });
    expect(redone.scene).toBe(current);
    expect(redone.skipped).toBe(1);
  });

  it("redoing a creation makes the object again; redoing a deletion removes it", () => {
    const before = base();
    const created = addNode(before, createNode("c", "cone"));
    expect(redoOwnChange(before, { before, after: created }).scene).toEqual(
      created,
    );
    expect(
      redoOwnChange(created, { before: created, after: before }).scene,
    ).toEqual(before);
  });
});

function updateNodeParent(
  scene: Scene,
  id: string,
  parentId: string | null,
): Scene {
  return {
    ...scene,
    nodes: { ...scene.nodes, [id]: { ...scene.nodes[id]!, parentId } },
  };
}
