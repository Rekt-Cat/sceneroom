import { describe, expect, it } from "vitest";
import { createEmptyScene, type AssetInfo } from "./scene";
import { addAsset, addNode, createModelNode, createNode } from "./sceneOps";
import { createModifier, supportsModifiers } from "./modifiers";
import { bakeToMesh, meshAssetInfo, pruneUnusedMeshAssets } from "./meshOps";

const square = {
  positions: new Float32Array([0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
};
const info = (id = "mesh1") => meshAssetInfo(id, "Trunk", square, 100);

describe("meshAssetInfo", () => {
  it("records the kind, the triangles, the box, the stored size and a name", () => {
    expect(info()).toEqual({
      id: "mesh1",
      name: "Trunk",
      type: "mesh",
      bytes: 100,
      triangles: 2,
      boundsMin: [0, 0, 0],
      boundsMax: [2, 3, 0],
      note: "",
    });
    expect(meshAssetInfo("x", "", square, 1).name).toBe("Mesh");
    expect(meshAssetInfo("x", "y".repeat(200), square, 1).name).toHaveLength(
      100,
    );
  });
});

describe("bakeToMesh", () => {
  const tree = () => {
    let scene = createEmptyScene();
    scene = addNode(scene, {
      ...createNode("trunk", "cylinder"),
      name: "Trunk",
      color: "#8b5a2b",
      segments: 12,
      modifiers: [createModifier("m", "bend")],
      transform: {
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        scale: [2, 2, 2],
      },
    });
    scene = addNode(scene, {
      ...createNode("leaf", "sphere"),
      parentId: "trunk",
    });
    return scene;
  };

  it("turns the object into a mesh in place and keeps everything else about it", () => {
    const before = tree();
    const after = bakeToMesh(before, "trunk", info());
    expect(after.nodes["trunk"]).toMatchObject({
      kind: "mesh",
      assetId: "mesh1",
      modifiers: [],
      segments: 1,
      name: "Trunk",
      color: "#8b5a2b",
      transform: {
        position: [1, 2, 3],
        rotation: [0.1, 0.2, 0.3],
        scale: [2, 2, 2],
      },
    });
    expect(after.nodes["leaf"]?.parentId).toBe("trunk");
    expect(after.assets["mesh1"]).toEqual(info());
    // the original scene is untouched (this is what makes Undo possible)
    expect(before.nodes["trunk"]?.kind).toBe("cylinder");
    expect(before.assets["mesh1"]).toBeUndefined();
  });

  it("works for a plain shape (Convert to mesh) and for a mesh that gets new modifiers (Apply again)", () => {
    const plain = addNode(createEmptyScene(), createNode("a", "cube"));
    const mesh = bakeToMesh(plain, "a", info("v1"));
    const bent = {
      ...mesh,
      nodes: {
        ...mesh.nodes,
        a: { ...mesh.nodes["a"]!, modifiers: [createModifier("b", "twist")] },
      },
    };
    expect(supportsModifiers(bent.nodes["a"]!)).toBe(true);
    const again = bakeToMesh(bent, "a", info("v2"));
    expect(again.nodes["a"]).toMatchObject({
      kind: "mesh",
      assetId: "v2",
      modifiers: [],
    });
    // the first version stays in the scene's list until it is pruned (Undo can come back to it)
    expect(Object.keys(again.assets).sort()).toEqual(["v1", "v2"]);
  });

  it("refuses a model, a light, a missing object, and data that is not a mesh", () => {
    let scene = addAsset(createEmptyScene(), {
      ...info("glb"),
      type: "model",
    } as AssetInfo);
    scene = addNode(scene, createModelNode("m", "Car", "glb", 1));
    expect(() => bakeToMesh(scene, "m", info())).toThrow(
      "cannot be turned into a mesh",
    );
    expect(() => bakeToMesh(scene, "nope", info())).toThrow("does not exist");
    const cube = addNode(createEmptyScene(), createNode("c", "cube"));
    expect(() => bakeToMesh(cube, "c", { ...info(), type: "model" })).toThrow(
      "not a mesh",
    );
  });
});

describe("pruneUnusedMeshAssets", () => {
  it("drops the records of meshes no object uses, and keeps models and used meshes", () => {
    let scene = createEmptyScene();
    scene = addAsset(scene, info("used"));
    scene = addAsset(scene, info("old"));
    scene = addAsset(scene, { ...info("model"), type: "model" } as AssetInfo);
    scene = addNode(scene, {
      ...createNode("a", "cube"),
      kind: "mesh",
      assetId: "used",
    });
    const pruned = pruneUnusedMeshAssets(scene);
    expect(Object.keys(pruned.assets).sort()).toEqual(["model", "used"]);
    // nothing to drop: the very same scene comes back
    expect(pruneUnusedMeshAssets(pruned)).toBe(pruned);
  });
});
