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
