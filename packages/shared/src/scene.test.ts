import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATERIAL,
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
  it("new nodes get the default surface", () => {
    const node = createNode("a", "cube");
    expect(node.material).toEqual(DEFAULT_MATERIAL);
    expect(node.material.roughness).toBe(DEFAULT_ROUGHNESS);
    expect(node.material.metalness).toBe(DEFAULT_METALNESS);
  });

  it("a new plane is drawn from both sides, other shapes only from the front", () => {
    expect(createNode("p", "plane").material.doubleSided).toBe(true);
    expect(createNode("c", "cube").material.doubleSided).toBe(false);
  });

  it("a node saved with no material at all loads with the defaults", () => {
    const { material, ...oldNode } = createNode("a", "cube");
    void material;
    expect(sceneNodeSchema.parse(oldNode).material).toEqual(DEFAULT_MATERIAL);
  });

  it("an older node with roughness and metalness on the node itself moves them into the material", () => {
    const { material, ...rest } = createNode("a", "cube");
    void material;
    const parsed = sceneNodeSchema.parse({
      ...rest,
      roughness: 0.2,
      metalness: 0.9,
    });
    expect(parsed.material).toEqual({
      ...DEFAULT_MATERIAL,
      roughness: 0.2,
      metalness: 0.9,
    });
    expect("roughness" in parsed).toBe(false);
  });

  it("an older plane keeps being drawn from both sides", () => {
    const { material, ...rest } = createNode("p", "plane");
    void material;
    expect(
      sceneNodeSchema.parse({ ...rest, roughness: 0.5, metalness: 0 }).material
        .doubleSided,
    ).toBe(true);
    expect(sceneNodeSchema.parse(rest).material.doubleSided).toBe(true);
  });

  it("a material with only some fields gets the rest from the defaults", () => {
    const node = createNode("a", "cube");
    const parsed = sceneNodeSchema.parse({
      ...node,
      material: { opacity: 0.5 },
    });
    expect(parsed.material).toEqual({ ...DEFAULT_MATERIAL, opacity: 0.5 });
  });

  it("rejects values outside their range", () => {
    const node = createNode("a", "cube");
    const bad = (change: object) =>
      sceneNodeSchema.safeParse({
        ...node,
        material: { ...node.material, ...change },
      }).success;
    expect(bad({ roughness: 1.5 })).toBe(false);
    expect(bad({ metalness: -0.1 })).toBe(false);
    expect(bad({ opacity: 2 })).toBe(false);
    expect(bad({ emissiveIntensity: 99 })).toBe(false);
    expect(bad({ emissiveColor: "red" })).toBe(false);
    expect(bad({ castShadow: "yes" })).toBe(false);
    expect(bad({ opacity: 0.5, emissiveColor: "#ff8800" })).toBe(true);
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
