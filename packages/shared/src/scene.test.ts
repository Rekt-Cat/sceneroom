import { describe, expect, it } from "vitest";
import {
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
