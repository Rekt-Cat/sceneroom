import { describe, expect, it } from "vitest";
import { parseSavedScene } from "./persistence";
import { createEmptyScene } from "./scene";
import { addNode, createModelNode, createNode, addAsset } from "./sceneOps";

describe("parseSavedScene", () => {
  it("accepts a scene exactly as it was saved", () => {
    let scene = createEmptyScene();
    scene = addNode(scene, createNode("a", "cube"));
    const result = parseSavedScene(JSON.parse(JSON.stringify(scene)));
    expect(result).toEqual({ ok: true, scene });
  });

  it("accepts a scene with an imported model and its file record", () => {
    let scene = addAsset(createEmptyScene(), {
      id: "abc",
      name: "Car",
      type: "model",
      bytes: 10,
      triangles: 3,
      boundsMin: [0, 0, 0],
      boundsMax: [1, 1, 1],
    });
    scene = addNode(scene, createModelNode("m", "Car", "abc", 2));
    expect(parseSavedScene(JSON.parse(JSON.stringify(scene))).ok).toBe(true);
  });

  it("fills in fields that did not exist when an older scene was saved", () => {
    const { locked, roughness, metalness, assetId, ...old } = createNode(
      "a",
      "cube",
    );
    void locked;
    void roughness;
    void metalness;
    void assetId;
    const result = parseSavedScene({ version: 1, nodes: { a: old } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scene.nodes["a"]).toMatchObject({
        locked: false,
        assetId: null,
        roughness: 0.6,
      });
      expect(result.scene.assets).toEqual({});
    }
  });

  it("refuses data that is not a scene, and says roughly where it is wrong", () => {
    for (const bad of [
      null,
      undefined,
      "text",
      42,
      [],
      {},
      { version: 2, nodes: {} },
    ]) {
      expect(parseSavedScene(bad).ok, String(bad)).toBe(false);
    }
    const broken = parseSavedScene({ version: 1, nodes: { a: { id: "a" } } });
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.reason).toContain("nodes.a");
  });

  it("refuses a node with a value outside what the app allows", () => {
    const node = { ...createNode("a", "cube"), roughness: 9 };
    expect(parseSavedScene({ version: 1, nodes: { a: node } }).ok).toBe(false);
  });
});
