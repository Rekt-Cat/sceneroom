import { describe, expect, it } from "vitest";
import { createEmptyScene } from "./scene";
import { addNode, createNode, removeNode } from "./sceneOps";
import { resolveSelection } from "./selection";

describe("resolveSelection", () => {
  const scene = addNode(createEmptyScene(), createNode("a", "cube"));

  it("keeps an id that exists", () => {
    expect(resolveSelection(scene, "a")).toBe("a");
  });

  it("returns null for null or an unknown id", () => {
    expect(resolveSelection(scene, null)).toBeNull();
    expect(resolveSelection(scene, "nope")).toBeNull();
  });

  it("returns null once the selected node has been removed", () => {
    expect(resolveSelection(removeNode(scene, "a"), "a")).toBeNull();
  });
});
