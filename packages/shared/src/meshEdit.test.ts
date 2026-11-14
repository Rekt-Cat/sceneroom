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

import {
  deletePoints,
  expandToWelded,
  extrudeFaces,
  faceDirection,
  selectedFaces,
  selectionAfterWeldedClick,
  transformSelected,
  weldGroups,
} from "./meshEdit";

/** A square facing +z (its triangles wind counter-clockwise seen from +z), 1 across. */
const quad = () => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});

/** Two squares side by side (x from 0 to 2) that do NOT share points along x = 1 (like faces of a cube). */
const strip = () => ({
  positions: new Float32Array([
    0,
    0,
    0,
    1,
    0,
    0,
    1,
    1,
    0,
    0,
    1,
    0, // first square: points 0 to 3
    1,
    0,
    0,
    2,
    0,
    0,
    2,
    1,
    0,
    1,
    1,
    0, // second square: points 4 to 7 (4 and 7 sit where 1 and 2 are)
  ]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]),
});

/** The normal of triangle t of a mesh (not unit length). */
function normalOf(
  mesh: { positions: Float32Array; indices: Uint32Array },
  t: number,
): [number, number, number] {
  const p = (i: number) => [
    mesh.positions[i * 3]!,
    mesh.positions[i * 3 + 1]!,
    mesh.positions[i * 3 + 2]!,
  ];
  const [a, b, c] = [
    mesh.indices[t * 3]!,
    mesh.indices[t * 3 + 1]!,
    mesh.indices[t * 3 + 2]!,
  ].map(p) as [number[], number[], number[]];
  const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
  return [
    u[1]! * v[2]! - u[2]! * v[1]!,
    u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!,
  ];
}
const centreOf = (
  mesh: { positions: Float32Array; indices: Uint32Array },
  t: number,
) => {
  let x = 0,
    y = 0,
    z = 0;
  for (let k = 0; k < 3; k++) {
    const i = mesh.indices[t * 3 + k]! * 3;
    x += mesh.positions[i]! / 3;
    y += mesh.positions[i + 1]! / 3;
    z += mesh.positions[i + 2]! / 3;
  }
  return [x, y, z] as const;
};

describe("points on the same spot", () => {
  it("groups points that sit together, and keeps the others apart", () => {
    const groups = weldGroups(strip().positions);
    expect(groups.members.length).toBe(6); // 8 points, two pairs share a spot
    expect(groups.ids[1]).toBe(groups.ids[4]);
    expect(groups.ids[2]).toBe(groups.ids[7]);
    expect(groups.ids[0]).not.toBe(groups.ids[1]);
  });

  it("points a tiny bit apart still count as one, but points further apart do not", () => {
    const positions = new Float32Array([0, 0, 0, 0.00001, 0, 0, 0.01, 0, 0]);
    const groups = weldGroups(positions, 1e-4);
    expect(groups.ids[0]).toBe(groups.ids[1]);
    expect(groups.ids[0]).not.toBe(groups.ids[2]);
  });

  it("expands points to everything on their spot, without repeats", () => {
    const groups = weldGroups(strip().positions);
    expect(expandToWelded(groups, [1].concat([4])).sort()).toEqual([1, 4]);
    expect(expandToWelded(groups, [0])).toEqual([0]);
    expect(expandToWelded(groups, [99])).toEqual([]);
  });

  it("clicking a point selects its whole spot; Shift toggles the whole spot", () => {
    const groups = weldGroups(strip().positions);
    expect(selectionAfterWeldedClick(groups, [], 1, false).sort()).toEqual([
      1, 4,
    ]);
    expect(selectionAfterWeldedClick(groups, [0], 4, true).sort()).toEqual([
      0, 1, 4,
    ]);
    expect(selectionAfterWeldedClick(groups, [0, 1, 4], 1, true)).toEqual([0]);
    // a spot only half selected is completed, not removed
    expect(selectionAfterWeldedClick(groups, [1], 4, true).sort()).toEqual([
      1, 4,
    ]);
    expect(selectionAfterWeldedClick(groups, [0, 1], -1, false)).toEqual([]);
    expect(selectionAfterWeldedClick(groups, [0, 1], -1, true)).toEqual([0, 1]);
  });
});

describe("turning and scaling points", () => {
  const start = new Float32Array([1, 0, 0, 2, 0, 0, 5, 5, 5]);
  // column by column, as three.js stores a matrix
  const translation = (x: number, y: number, z: number) => [
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    x,
    y,
    z,
    1,
  ];
  const scaleAbout = (s: number, cx: number) => [
    s,
    0,
    0,
    0,
    0,
    s,
    0,
    0,
    0,
    0,
    s,
    0,
    cx - s * cx,
    0,
    0,
    1,
  ];
  const quarterTurnAboutZ = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  it("moves only the selected points by the matrix", () => {
    const out = transformSelected(start, [0], translation(0, 3, 0));
    expect(Array.from(out)).toEqual([1, 3, 0, 2, 0, 0, 5, 5, 5]);
  });

  it("scales around a pivot (the pivot stays where it is)", () => {
    // double the size around x = 1: the point at x = 1 stays, the point at x = 2 goes to x = 3
    const out = transformSelected(start, [0, 1], scaleAbout(2, 1));
    expect([out[0], out[3]]).toEqual([1, 3]);
    expect(Array.from(out.slice(6))).toEqual([5, 5, 5]);
  });

  it("turns points a quarter turn", () => {
    const out = transformSelected(start, [1], quarterTurnAboutZ);
    expect(out[3]).toBeCloseTo(0);
    expect(out[4]).toBeCloseTo(2);
  });

  it("is measured from the start, so doing it twice does not add up", () => {
    const target = new Float32Array(start.length);
    transformSelected(start, [0], translation(10, 0, 0), target);
    transformSelected(start, [0], translation(1, 0, 0), target);
    expect(target[0]).toBe(2);
  });
});

describe("deleting points", () => {
  it("removes the points and every triangle that used them, and renumbers what is left", () => {
    const result = deletePoints(strip(), [4, 5, 6, 7]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mesh.indices.length).toBe(6);
    expect(result.mesh.positions.length / 3).toBe(4); // the second square's points are gone
    expect(result.selected).toEqual([]);
    expect(Math.max(...result.mesh.indices)).toBeLessThan(4);
  });

  it("one point takes only the triangles that use it, and renumbers what is left", () => {
    // point 5 is used by one triangle only (4, 5, 6); the other triangle of that square (4, 6, 7) stays
    const result = deletePoints(strip(), [5]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mesh.indices.length / 3).toBe(3);
    expect(result.mesh.positions.length / 3).toBe(7);
    expect(Math.max(...result.mesh.indices)).toBeLessThan(7);
  });

  it("refuses an empty selection and a selection that would delete everything", () => {
    const none = deletePoints(quad(), []);
    expect(!none.ok && none.reason).toContain("Select some points");
    const all = deletePoints(quad(), [0, 1, 2, 3]);
    expect(!all.ok && all.reason).toContain("whole mesh");
    // point 0 of a single square is used by both of its triangles: nothing would be left
    expect(deletePoints(quad(), [0]).ok).toBe(false);
  });

  it("keeps the positions of the points that stay", () => {
    const result = deletePoints(strip(), [0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the first square's two triangles both use point 0, so only the second square is left
    expect(result.mesh.indices.length).toBe(6);
    expect(Array.from(result.mesh.positions.slice(0, 3))).toEqual([1, 0, 0]);
  });
});

describe("extruding faces", () => {
  it("finds the faces whose three points are all selected", () => {
    expect(selectedFaces(quad(), [0, 1, 2])).toEqual([0]);
    expect(selectedFaces(quad(), [0, 1, 2, 3])).toEqual([0, 1]);
    expect(selectedFaces(quad(), [0, 1])).toEqual([]);
  });

  it("the direction of a face is its normal; faces that cancel out have none", () => {
    expect(faceDirection(quad(), [0, 1])).toEqual([0, 0, 1]);
    const opposed = {
      positions: new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0,
      ]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };
    expect(faceDirection(opposed, [0, 1])).toBeNull();
  });

  it("pushes a copy of the face out along its normal and selects the copy", () => {
    const mesh = quad();
    const result = extrudeFaces(
      mesh,
      [0, 1, 2, 3],
      0.5,
      weldGroups(mesh.positions),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selected.length).toBe(4);
    for (const point of result.selected) {
      expect(result.mesh.positions[point * 3 + 2]).toBeCloseTo(0.5);
    }
    // the original square is gone as a face (it became the cap); nothing of it is left at z = 0 as a cap
    const caps = selectedFaces(result.mesh, result.selected);
    expect(caps.length).toBe(2);
    for (const t of caps)
      expect(normalOf(result.mesh, t)[2]).toBeGreaterThan(0);
  });

  it("builds a wall on every outer edge, each facing away from the extruded face", () => {
    const mesh = quad();
    const result = extrudeFaces(
      mesh,
      [0, 1, 2, 3],
      1,
      weldGroups(mesh.positions),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const triangles = result.mesh.indices.length / 3;
    expect(triangles).toBe(2 + 4 * 2); // the cap, and 4 walls of 2 triangles
    const middle = [0.5, 0.5];
    for (let t = 2; t < triangles; t++) {
      const [nx, ny, nz] = normalOf(result.mesh, t);
      const [cx, cy] = centreOf(result.mesh, t);
      // a wall is vertical (no z in its normal) and points away from the middle of the square
      expect(nz).toBeCloseTo(0);
      expect(nx * (cx - middle[0]!) + ny * (cy - middle[1]!)).toBeGreaterThan(
        0,
      );
    }
  });

  it("points on the same spot count as one, so the join between two faces gets no wall", () => {
    const mesh = strip();
    const result = extrudeFaces(
      mesh,
      [0, 1, 2, 3, 4, 5, 6, 7],
      1,
      weldGroups(mesh.positions),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the outer edge of a 2 x 1 rectangle has 6 unit edges: 12 wall triangles, plus 4 cap triangles
    expect(result.mesh.indices.length / 3).toBe(4 + 6 * 2);
  });

  it("faces next to the extruded one stay where they are", () => {
    const mesh = strip();
    const result = extrudeFaces(
      mesh,
      [0, 1, 2, 3],
      1,
      weldGroups(mesh.positions),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the second square's triangles are still there, still at z = 0 and facing +z
    const untouched = [];
    for (let t = 0; t < result.mesh.indices.length / 3; t++) {
      const [x, , z] = centreOf(result.mesh, t);
      if (x > 1 && z === 0) untouched.push(t);
    }
    expect(untouched.length).toBe(2);
  });

  it("a different distance changes how far the copy goes, and a distance of 0 still makes valid geometry", () => {
    const mesh = quad();
    const groups = weldGroups(mesh.positions);
    const far = extrudeFaces(mesh, [0, 1, 2, 3], 3, groups);
    const flat = extrudeFaces(mesh, [0, 1, 2, 3], 0, groups);
    expect(far.ok && far.mesh.positions[far.selected[0]! * 3 + 2]).toBeCloseTo(
      3,
    );
    expect(flat.ok && flat.mesh.indices.length / 3).toBe(10);
  });

  it("every triangle uses points that exist", () => {
    const mesh = strip();
    const result = extrudeFaces(
      mesh,
      [0, 1, 2, 3],
      1,
      weldGroups(mesh.positions),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.max(...result.mesh.indices)).toBeLessThan(
      result.mesh.positions.length / 3,
    );
  });

  it("refuses when no whole face is selected", () => {
    const mesh = quad();
    const result = extrudeFaces(mesh, [0, 1], 1, weldGroups(mesh.positions));
    expect(!result.ok && result.reason).toContain(
      "Select all the points of at least one face",
    );
  });
});

import { EXTRUDE_FRACTION, extrudeDistance } from "./meshEdit";

describe("how far a new extrusion goes", () => {
  it("a quarter of the size of what is selected", () => {
    expect(EXTRUDE_FRACTION).toBe(0.25);
    expect(extrudeDistance(strip(), [0, 1, 2, 3, 4, 5, 6, 7])).toBeCloseTo(0.5); // 2 across
    expect(extrudeDistance(strip(), [0, 1, 2, 3])).toBeCloseTo(0.25); // 1 across
  });

  it("falls back to the whole mesh when the selection has no size, and to 0.25 for nothing at all", () => {
    expect(extrudeDistance(strip(), [0])).toBeCloseTo(0.5);
    expect(
      extrudeDistance(
        { positions: new Float32Array(0), indices: new Uint32Array(0) },
        [],
      ),
    ).toBe(0.25);
    expect(
      extrudeDistance(
        { positions: new Float32Array(3), indices: new Uint32Array(0) },
        [0],
      ),
    ).toBe(0.25);
  });
});

import { flatFacePoints } from "./meshEdit";

describe("selecting a whole face", () => {
  /** A cube made like three.js makes it: every face has its own four points, so faces do not share points. */
  function cube() {
    const positions: number[] = [];
    const indices: number[] = [];
    // [normal axis, sign]: +x, -x, +y, -y, +z, -z
    const faces: [number, number][] = [
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [2, 1],
      [2, -1],
    ];
    for (const [axis, sign] of faces) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      const base = positions.length / 3;
      // the corners of the face, wound counter-clockwise seen from outside
      const corners: [number, number][] =
        sign > 0
          ? [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ]
          : [
              [-1, -1],
              [-1, 1],
              [1, 1],
              [1, -1],
            ];
      for (const [cu, cv] of corners) {
        const p = [0, 0, 0];
        p[axis] = sign * 0.5;
        p[u] = cu * 0.5;
        p[v] = cv * 0.5;
        positions.push(...p);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return {
      positions: new Float32Array(positions),
      indices: new Uint32Array(indices),
    };
  }

  it("gives both triangles of one side of a cube (and none of the other sides)", () => {
    const mesh = cube();
    const groups = weldGroups(mesh.positions);
    // triangle 8 is in the +z side (faces are listed +x, -x, +y, -y, +z, -z with two triangles each)
    const points = flatFacePoints(mesh, 8, groups);
    expect(points.sort((a, b) => a - b)).toEqual([16, 17, 18, 19]);
    // all four points sit at z = +0.5
    for (const point of points)
      expect(mesh.positions[point * 3 + 2]).toBeCloseTo(0.5);
  });

  it("the other triangle of the same side gives the same face", () => {
    const mesh = cube();
    const groups = weldGroups(mesh.positions);
    expect(flatFacePoints(mesh, 9, groups).sort((a, b) => a - b)).toEqual([
      16, 17, 18, 19,
    ]);
  });

  it("a flat surface made of many triangles is one face", () => {
    // a 3 x 3 grid of squares in the x-y plane: 16 points, 18 triangles
    const positions: number[] = [];
    for (let y = 0; y <= 3; y++)
      for (let x = 0; x <= 3; x++) positions.push(x, y, 0);
    const indices: number[] = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const a = y * 4 + x;
        indices.push(a, a + 1, a + 5, a, a + 5, a + 4);
      }
    }
    const mesh = {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
    };
    expect(flatFacePoints(mesh, 7, weldGroups(mesh.positions)).length).toBe(16);
  });

  it("stops at a corner: a bent surface only gives the flat part", () => {
    // two squares meeting at 90 degrees along x = 1 (one flat on the floor, one standing up)
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0,
    ]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const mesh = { positions, indices };
    const points = flatFacePoints(mesh, 0, weldGroups(positions));
    expect(points.sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("a wider angle joins slightly bent triangles", () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0.05, 2, 1, 0.05, 1, 1,
      0,
    ]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const mesh = { positions, indices };
    const groups = weldGroups(positions);
    expect(flatFacePoints(mesh, 0, groups, 1).length).toBe(4);
    expect(flatFacePoints(mesh, 0, groups, 10).length).toBe(8);
  });

  it("a triangle that does not exist gives nothing", () => {
    const mesh = cube();
    expect(flatFacePoints(mesh, 99, weldGroups(mesh.positions))).toEqual([]);
    expect(flatFacePoints(mesh, -1, weldGroups(mesh.positions))).toEqual([]);
  });

  it("extruding a cube side makes a taller box: the result has the walls and the cap", () => {
    const mesh = cube();
    const groups = weldGroups(mesh.positions);
    const side = flatFacePoints(mesh, 8, groups);
    const result = extrudeFaces(mesh, side, 0.5, groups);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 10 triangles of the other five sides, 2 for the cap, 4 walls of 2 = 20
    expect(result.mesh.indices.length / 3).toBe(10 + 2 + 8);
    // the cap sits half a unit above the old +z side
    for (const point of result.selected)
      expect(result.mesh.positions[point * 3 + 2]).toBeCloseTo(1);
  });
});
