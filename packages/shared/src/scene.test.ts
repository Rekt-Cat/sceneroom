import { describe, expect, it } from "vitest";
import {
  DEFAULT_METALNESS,
  DEFAULT_ROUGHNESS,
  SCENE_SCHEMA_VERSION,
  createEmptyScene,
  sceneNodeSchema,
  sceneSchema,
} from "./scene";
import { createNode } from "./sceneOps";

describe("sceneNodeSchema locked flag", () => {
  it("new nodes start unlocked", () => {
    expect(createNode("a", "cube").locked).toBe(false);
  });

  it("a node saved before the flag existed loads as unlocked", () => {
    const { locked, ...oldNode } = createNode("a", "cube");
    void locked;
    const parsed = sceneNodeSchema.parse(oldNode);
    expect(parsed.locked).toBe(false);
  });

  it("keeps locked = true", () => {
    const parsed = sceneNodeSchema.parse({
      ...createNode("a", "cube"),
      locked: true,
    });
    expect(parsed.locked).toBe(true);
  });

  it("rejects a locked flag that is not true or false", () => {
    expect(
      sceneNodeSchema.safeParse({ ...createNode("a", "cube"), locked: "yes" })
        .success,
    ).toBe(false);
  });

  it("an old scene (nodes without the flag) still passes the scene schema", () => {
    const { locked, ...oldNode } = createNode("a", "cube");
    void locked;
    const scene = { ...createEmptyScene(), nodes: { a: oldNode } };
    const result = sceneSchema.safeParse(scene);
    expect(result.success).toBe(true);
    expect(scene.version).toBe(SCENE_SCHEMA_VERSION);
  });
});

describe("sceneNodeSchema material values", () => {
  it("new nodes get the default roughness and metalness", () => {
    const node = createNode("a", "cube");
    expect(node.roughness).toBe(DEFAULT_ROUGHNESS);
    expect(node.metalness).toBe(DEFAULT_METALNESS);
  });

  it("a node saved before these fields existed loads with the defaults", () => {
    const { roughness, metalness, ...oldNode } = createNode("a", "cube");
    void roughness;
    void metalness;
    const parsed = sceneNodeSchema.parse(oldNode);
    expect(parsed.roughness).toBe(DEFAULT_ROUGHNESS);
    expect(parsed.metalness).toBe(DEFAULT_METALNESS);
  });

  it("rejects values outside 0 to 1", () => {
    const node = createNode("a", "cube");
    expect(sceneNodeSchema.safeParse({ ...node, roughness: 1.5 }).success).toBe(
      false,
    );
    expect(
      sceneNodeSchema.safeParse({ ...node, metalness: -0.1 }).success,
    ).toBe(false);
  });
});

describe("model objects and assets in the scene schema", () => {
  const info = {
    id: "abc123",
    name: "Muscle car",
    type: "model" as const,
    bytes: 1024,
    triangles: 5000,
    boundsMin: [-1, 0, -2] as [number, number, number],
    boundsMax: [1, 1.5, 2] as [number, number, number],
  };

  it("built-in shapes have no asset id", () => {
    expect(createNode("a", "cube").assetId).toBeNull();
  });

  it("a node saved before assets existed loads with assetId null", () => {
    const { assetId, ...oldNode } = createNode("a", "cube");
    void assetId;
    expect(sceneNodeSchema.parse(oldNode).assetId).toBeNull();
  });

  it("accepts a model node and rejects an unknown kind", () => {
    const model = {
      ...createNode("a", "cube"),
      kind: "model",
      assetId: "abc123",
    };
    expect(sceneNodeSchema.safeParse(model).success).toBe(true);
    expect(
      sceneNodeSchema.safeParse({ ...model, kind: "teapot" }).success,
    ).toBe(false);
  });

  it("a scene saved before assets existed loads with an empty asset list", () => {
    const parsed = sceneSchema.parse({
      version: SCENE_SCHEMA_VERSION,
      nodes: {},
    });
    expect(parsed.assets).toEqual({});
  });

  it("accepts a valid asset record and refuses broken ones", () => {
    const scene = { ...createEmptyScene(), assets: { abc123: info } };
    expect(sceneSchema.safeParse(scene).success).toBe(true);
    for (const bad of [
      { ...info, id: "" },
      { ...info, bytes: -1 },
      { ...info, triangles: 1.5 },
      { ...info, type: "texture" },
      { ...info, boundsMin: [0, 0] },
    ]) {
      expect(
        sceneSchema.safeParse({ ...createEmptyScene(), assets: { x: bad } })
          .success,
      ).toBe(false);
    }
  });
});
