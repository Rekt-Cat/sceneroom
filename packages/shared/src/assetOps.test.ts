import { describe, expect, it } from "vitest";
import { createEmptyScene, type AssetInfo } from "./scene";
import { addAsset, addNode, createModelNode, createNode } from "./sceneOps";
import {
  assetUsageCounts,
  nodesUsingAsset,
  removeAsset,
  renameAsset,
  setAssetNote,
} from "./assetOps";

const car: AssetInfo = {
  id: "car",
  name: "Car",
  type: "model",
  bytes: 10,
  triangles: 3,
  boundsMin: [0, 0, 0],
  boundsMax: [1, 1, 1],
  note: "",
};

function sceneWithCars() {
  let scene = addAsset(createEmptyScene(), car);
  scene = addNode(scene, createModelNode("m1", "Car", "car", 1));
  scene = addNode(scene, createModelNode("m2", "Car (1)", "car", 1));
  // a cube inside the first car
  scene = addNode(scene, { ...createNode("c", "cube"), parentId: "m1" });
  scene = addNode(scene, createNode("other", "sphere"));
  return scene;
}

describe("asset usage", () => {
  it("lists the objects that show a file, and counts them", () => {
    const scene = sceneWithCars();
    expect(nodesUsingAsset(scene, "car").sort()).toEqual(["m1", "m2"]);
    expect(assetUsageCounts(scene)).toEqual({ car: 2 });
  });
});

describe("renameAsset and setAssetNote", () => {
  it("renames, trimming the name", () => {
    const next = renameAsset(sceneWithCars(), "car", "  Red car ");
    expect(next.assets["car"]?.name).toBe("Red car");
  });

  it("ignores an empty name, an unknown file and no change", () => {
    const scene = sceneWithCars();
    expect(renameAsset(scene, "car", "   ")).toBe(scene);
    expect(renameAsset(scene, "nope", "x")).toBe(scene);
    expect(renameAsset(scene, "car", "Car")).toBe(scene);
  });

  it("keeps the objects' own names", () => {
    const next = renameAsset(sceneWithCars(), "car", "Red car");
    expect(next.nodes["m1"]?.name).toBe("Car");
  });

  it("sets the note and cuts it to the allowed length", () => {
    const scene = sceneWithCars();
    expect(setAssetNote(scene, "car", "CC-BY").assets["car"]?.note).toBe(
      "CC-BY",
    );
    expect(
      setAssetNote(scene, "car", "x".repeat(600)).assets["car"]?.note,
    ).toHaveLength(500);
    expect(setAssetNote(scene, "car", "")).toBe(scene);
  });
});

describe("removeAsset", () => {
  it("removes the file, every object showing it and what is inside them", () => {
    const result = removeAsset(sceneWithCars(), "car");
    expect(Object.keys(result.scene.nodes)).toEqual(["other"]);
    expect(result.scene.assets).toEqual({});
    expect(result.removedNodeIds.sort()).toEqual(["c", "m1", "m2"]);
  });

  it("does nothing for an unknown file", () => {
    const scene = sceneWithCars();
    expect(removeAsset(scene, "nope")).toEqual({ scene, removedNodeIds: [] });
  });
});
