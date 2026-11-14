import { describe, expect, it } from "vitest";
import { createEmptyScene, type AssetInfo } from "./scene";
import { addNode, createNode } from "./sceneOps";
import {
  allPoints,
  meshEdges,
  nearestPoint,
  pointsInRect,
  selectionAfterBox,
  selectionAfterClick,
  selectionCentroid,
  translateSelected,
} from "./meshEdit";
import { bakeToMesh, meshAssetInfo, replaceMesh } from "./meshOps";

describe("meshEdges", () => {
  it("lists each shared edge once", () => {
    // two triangles sharing the edge 1-2 (a square split along its diagonal)
    const edges = meshEdges(new Uint32Array([0, 1, 2, 1, 3, 2]));
    const pairs = [];
    for (let i = 0; i < edges.length; i += 2)
      pairs.push(`${edges[i]}-${edges[i + 1]}`);
    expect(pairs.sort()).toEqual(["0-1", "0-2", "1-2", "1-3", "2-3"]);
  });

  it("a tetrahedron (closed, shared points) has 6 edges, each between two triangles", () => {
    const edges = meshEdges(
      new Uint32Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]),
    );
    expect(edges.length / 2).toBe(6);
  });

  it("does not care which way round an edge is written", () => {
    expect(meshEdges(new Uint32Array([0, 1, 2, 2, 1, 0])).length / 2).toBe(3);
  });

  it("an empty list or a leftover corner gives no edges", () => {
    expect(meshEdges(new Uint32Array(0)).length).toBe(0);
    expect(meshEdges(new Uint32Array([0, 1])).length).toBe(0);
  });
});

describe("picking points on the screen", () => {
  // three points: at (10,10), (50,50) and (52,50)
  const projected = new Float32Array([10, 10, 50, 50, 52, 50]);

  it("finds the nearest point within the distance", () => {
    expect(nearestPoint(projected, 12, 11, 8)).toBe(0);
    expect(nearestPoint(projected, 51.5, 50, 8)).toBe(2);
    expect(nearestPoint(projected, 100, 100, 8)).toBe(-1);
  });

  it("two equally near points: the lower number wins", () => {
    expect(nearestPoint(projected, 51, 50, 8)).toBe(1);
  });

  it("never picks a point that cannot be shown (behind the camera)", () => {
    const hidden = new Float32Array([NaN, NaN, 30, 30]);
    expect(nearestPoint(hidden, 0, 0, 100)).toBe(1);
    expect(nearestPoint(new Float32Array([NaN, NaN]), 0, 0, 100)).toBe(-1);
  });

  it("a distance of exactly the limit counts", () => {
    expect(nearestPoint(new Float32Array([0, 0]), 3, 4, 5)).toBe(0);
  });

  it("finds the points inside a box, edges included, and skips hidden ones", () => {
    const rect = { left: 40, top: 40, right: 52, bottom: 60 };
    expect(pointsInRect(projected, rect)).toEqual([1, 2]);
    expect(pointsInRect(new Float32Array([NaN, NaN, 45, 45]), rect)).toEqual([
      1,
    ]);
  });
});

describe("selecting points", () => {
  it("a plain click selects one point, or clears on empty space", () => {
    expect(selectionAfterClick([1, 2], 5, false)).toEqual([5]);
    expect(selectionAfterClick([1, 2], -1, false)).toEqual([]);
  });

  it("with Shift a click adds a point, takes it out again, and leaves things alone on empty space", () => {
    expect(selectionAfterClick([1, 2], 5, true)).toEqual([1, 2, 5]);
    expect(selectionAfterClick([1, 2, 5], 2, true)).toEqual([1, 5]);
    expect(selectionAfterClick([1, 2], -1, true)).toEqual([1, 2]);
  });

  it("a box replaces the selection, or adds to it without repeats", () => {
    expect(selectionAfterBox([1, 2], [2, 3], false)).toEqual([2, 3]);
    expect(selectionAfterBox([1, 2], [2, 3], true)).toEqual([1, 2, 3]);
  });

  it("all the points", () => {
    expect(allPoints(4)).toEqual([0, 1, 2, 3]);
    expect(allPoints(0)).toEqual([]);
  });
});

describe("moving points", () => {
  const start = new Float32Array([0, 0, 0, 2, 0, 0, 2, 4, 0]);

  it("the middle of the selected points", () => {
    expect(selectionCentroid(start, [1, 2])).toEqual([2, 2, 0]);
    expect(selectionCentroid(start, [0])).toEqual([0, 0, 0]);
    expect(selectionCentroid(start, [])).toBeNull();
  });

  it("moves only the selected points, measured from where they started", () => {
    const moved = translateSelected(start, [1], [0, 1, 3]);
    expect(Array.from(moved)).toEqual([0, 0, 0, 2, 1, 3, 2, 4, 0]);
    expect(Array.from(start)).toEqual([0, 0, 0, 2, 0, 0, 2, 4, 0]); // untouched
  });

  it("writing into a target again from the start does not add up", () => {
    const target = new Float32Array(start.length);
    translateSelected(start, [1], [1, 0, 0], target);
    translateSelected(start, [1], [5, 0, 0], target);
    translateSelected(start, [1], [1, 0, 0], target);
    expect(target[3]).toBe(3);
  });

  it("a target that held something else is fully overwritten", () => {
    const target = new Float32Array([9, 9, 9, 9, 9, 9, 9, 9, 9]);
    translateSelected(start, [], [1, 1, 1], target);
    expect(Array.from(target)).toEqual(Array.from(start));
  });
});

describe("replaceMesh", () => {
  const square = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };
  const info = (id: string): AssetInfo =>
    meshAssetInfo(id, "Panel", square, 10, "made by hand");
  const meshScene = () =>
    bakeToMesh(
      addNode(createEmptyScene(), createNode("a", "cube")),
      "a",
      info("v1"),
    );

  it("points the object at a new version and keeps the old one listed (so Undo can go back)", () => {
    const before = meshScene();
    const after = replaceMesh(before, "a", info("v2"));
    expect(after.nodes["a"]?.assetId).toBe("v2");
    expect(Object.keys(after.assets).sort()).toEqual(["v1", "v2"]);
    expect(before.nodes["a"]?.assetId).toBe("v1");
    expect(after.nodes["a"]).toMatchObject({ kind: "mesh" });
  });

  it("refuses an object that is not a mesh, a missing one, and data that is not a mesh", () => {
    const plain = addNode(createEmptyScene(), createNode("c", "cube"));
    expect(() => replaceMesh(plain, "c", info("v2"))).toThrow("not a mesh");
    expect(() => replaceMesh(plain, "nope", info("v2"))).toThrow(
      "does not exist",
    );
    expect(() =>
      replaceMesh(meshScene(), "a", { ...info("v2"), type: "model" }),
    ).toThrow("not a mesh");
  });

  it("keeps the notes it is given", () => {
    expect(info("v2").note).toBe("made by hand");
  });
});
