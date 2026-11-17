import { describe, expect, it } from "vitest";
import {
  addNode,
  createEmptyScene,
  createNode,
  summariseScene,
  unusedModels,
  type AssetInfo,
  type Scene,
} from "./index";

const model = (id: string, triangles = 100): AssetInfo => ({
  id,
  name: id,
  type: "model",
  bytes: 10,
  triangles,
  boundsMin: [0, 0, 0],
  boundsMax: [1, 1, 1],
  note: "",
});

function sceneWith(): Scene {
  let scene = createEmptyScene();
  scene = addNode(scene, createNode("a", "cube"));
  scene = addNode(scene, {
    ...createNode("b", "cube"),
    kind: "point" as const,
  });
  scene = addNode(scene, {
    ...createNode("c", "cube"),
    kind: "model" as const,
    assetId: "m1",
  });
  scene = addNode(scene, {
    ...createNode("d", "cube"),
    kind: "model" as const,
    assetId: "m1",
  });
  return { ...scene, assets: { m1: model("m1", 50), m2: model("m2") } };
}

describe("summariseScene", () => {
  it("counts objects, lights and triangles (once per object showing a model)", () => {
    expect(summariseScene(sceneWith())).toEqual({
      objects: 4,
      lights: 1,
      prefabInstances: 0,
      triangles: 100,
    });
  });
  it("is all zero for an empty scene", () => {
    expect(summariseScene(createEmptyScene()).objects).toBe(0);
  });
});

describe("unusedModels", () => {
  it("lists models no object shows", () => {
    const scene = sceneWith();
    const unused = unusedModels([scene], [], Object.values(scene.assets));
    expect(unused.map((m) => m.id)).toEqual(["m2"]);
  });
  it("a model used only by a prefab is not unused", () => {
    const scene = sceneWith();
    const prefab = {
      id: "p",
      name: "P",
      revision: 1,
      assets: [model("m2")],
      nodes: [
        { ...createNode("n", "cube"), kind: "model" as const, assetId: "m2" },
      ],
    };
    expect(
      unusedModels([scene], [prefab], Object.values(scene.assets)),
    ).toEqual([]);
  });
});
