import { describe, expect, it } from "vitest";
import {
  MAX_DEFORMED_POINTS,
  MAX_SUBDIVIDE_LEVELS,
  buildTopology,
  createModifier,
  deformMesh,
  describeModifier,
  edgeCount,
  sanitizeModifierChange,
  subdivideMesh,
  summariseModifier,
  type ShapeMesh,
} from "./index";
import { box, plane } from "./testMeshes";

const count = (m: ShapeMesh) => m.positions.length / 3;
const triangles = (m: ShapeMesh) => m.indices.length / 3;
const at = (m: ShapeMesh, p: number) => [
  m.positions[p * 3]!,
  m.positions[p * 3 + 1]!,
  m.positions[p * 3 + 2]!,
];

describe("smoothing a box", () => {
  const cube = box(1); // 24 points: three at each corner
  const once = subdivideMesh(cube, 1, MAX_DEFORMED_POINTS);

  it("welds the corners, and every old face becomes four squares: 8 + 12 + 6 points, 24 squares", () => {
    expect(count(once)).toBe(8 + 12 + 6);
    expect(triangles(once)).toBe(24 * 2);
    const topology = buildTopology(once);
    expect(topology.faces).toHaveLength(24);
    expect(topology.faces.every((f) => f.vertices.length === 4)).toBe(true);
    // closed: every edge has two faces
    expect(topology.edgeFaces.every((faces) => faces.length === 2)).toBe(true);
    expect(edgeCount(topology)).toBe(48);
  });

  it("pulls the corners in to the exact Catmull-Clark spot (5/18 of the way out)", () => {
    // the first 8 points are the old corners; each coordinate is +-0.5 -> +-5/18
    const corners = Array.from({ length: 8 }, (_, v) => at(once, v));
    for (const [x, y, z] of corners) {
      for (const c of [x, y, z]) expect(Math.abs(c)).toBeCloseTo(5 / 18, 5);
    }
  });

  it("faces outwards: every triangle's normal points away from the middle", () => {
    for (let t = 0; t < triangles(once); t++) {
      const [a, b, c] = [
        once.indices[t * 3]!,
        once.indices[t * 3 + 1]!,
        once.indices[t * 3 + 2]!,
      ];
      const [pa, pb, pc] = [at(once, a), at(once, b), at(once, c)];
      const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
      const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
      const n = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ];
      const centre = [
        (pa[0]! + pb[0]! + pc[0]!) / 3,
        (pa[1]! + pb[1]! + pc[1]!) / 3,
        (pa[2]! + pb[2]! + pc[2]!) / 3,
      ];
      expect(
        n[0]! * centre[0]! + n[1]! * centre[1]! + n[2]! * centre[2]!,
      ).toBeGreaterThan(0);
    }
  });

  it("each further level makes about four times the faces and shrinks the shape a little more", () => {
    const twice = subdivideMesh(cube, 2, MAX_DEFORMED_POINTS);
    expect(count(twice)).toBe(26 + 48 + 24);
    expect(buildTopology(twice).faces).toHaveLength(96);
    // the shape rounds off: the average distance of its points from the middle goes down at each level
    const radius = (m: ShapeMesh) => {
      let sum = 0;
      for (let p = 0; p < count(m); p++) sum += Math.hypot(...at(m, p));
      return sum / count(m);
    };
    expect(radius(twice)).toBeLessThan(radius(once));
    expect(radius(once)).toBeLessThan(radius(cube));
  });

  it("is symmetric: the smoothed cube is the same on all sides", () => {
    for (let p = 0; p < count(once); p++) {
      const [x, y, z] = at(once, p);
      // the mirror image of every point is also a point of the mesh
      const mirrored =
        at(once, 0).length &&
        Array.from({ length: count(once) }, (_, q) => at(once, q)).some(
          ([a, b, c]) =>
            Math.abs(a! + x!) < 1e-5 &&
            Math.abs(b! + y!) < 1e-5 &&
            Math.abs(c! + z!) < 1e-5,
        );
      expect(mirrored).toBe(true);
    }
  });
});

describe("the border of a surface", () => {
  it("a single square: its corners move in along the border (1/8 of the way)", () => {
    const square = plane(1);
    const once = subdivideMesh(square, 1, MAX_DEFORMED_POINTS);
    // old vertices first: corners of the unit square (0,0), (1,0), (0,1), (1,1) -> pulled to 0.125 / 0.875
    const xs = Array.from({ length: 4 }, (_, v) => at(once, v)[0]!).sort(
      (a, b) => a - b,
    );
    expect(xs[0]).toBeCloseTo(0.125, 5);
    expect(xs[3]).toBeCloseTo(0.875, 5);
    // 4 + 4 + 1 points, 4 squares
    expect(count(once)).toBe(9);
    expect(buildTopology(once).faces).toHaveLength(4);
  });

  it("a flat surface stays flat", () => {
    const once = subdivideMesh(plane(3), 2, MAX_DEFORMED_POINTS);
    for (let p = 0; p < count(once); p++)
      expect(at(once, p)[1]).toBeCloseTo(0, 9);
  });

  it("the inside of a flat grid does not move (it is already smooth)", () => {
    const grid = plane(4);
    const once = subdivideMesh(grid, 1, MAX_DEFORMED_POINTS);
    // the middle point of the 5x5 points is vertex 12 and stays at (0.5, 0, 0.5)
    const topology = buildTopology(grid);
    const middle = topology.vertexOf[12]!;
    expect(at(once, middle)[0]).toBeCloseTo(0.5, 6);
    expect(at(once, middle)[2]).toBeCloseTo(0.5, 6);
  });
});

describe("other shapes", () => {
  it("a single triangle becomes three squares: 3 + 3 + 1 points", () => {
    const tri: ShapeMesh = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint32Array.from([0, 1, 2]),
    };
    const once = subdivideMesh(tri, 1, MAX_DEFORMED_POINTS);
    expect(count(once)).toBe(7);
    expect(triangles(once)).toBe(6);
    expect(
      buildTopology(once).faces.every((f) => f.vertices.length === 4),
    ).toBe(true);
  });

  it("an empty mesh, zero levels and a mesh with no area are returned as they are", () => {
    const empty: ShapeMesh = {
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
    };
    expect(subdivideMesh(empty, 2, MAX_DEFORMED_POINTS)).toBe(empty);
    const cube = box(1);
    expect(subdivideMesh(cube, 0, MAX_DEFORMED_POINTS)).toBe(cube);
  });

  it("never goes past the most points a shape may have", () => {
    const cube = box(4);
    const limit = count(cube) * 3; // room for less than one level (a level makes about four times as many)
    expect(subdivideMesh(cube, 3, limit)).toBe(cube);
    const some = subdivideMesh(cube, 3, 3000);
    expect(count(some)).toBeLessThanOrEqual(3000);
    // levels are capped at the limit
    expect(MAX_SUBDIVIDE_LEVELS).toBe(3);
  });

  it("does not change the mesh it is given", () => {
    const cube = box(1);
    const before = Array.from(cube.positions);
    subdivideMesh(cube, 2, MAX_DEFORMED_POINTS);
    expect(Array.from(cube.positions)).toEqual(before);
  });
});

describe("as a modifier", () => {
  it("is made with 1 level, works in all directions (no axis), and is described in plain words", () => {
    const m = createModifier("s", "subdivide");
    expect(m).toMatchObject({ type: "subdivide", levels: 1, enabled: true });
    expect(describeModifier(m)).toContain("Rounds the shape off");
    expect(summariseModifier(m)).toBe("Smooth, 1 level");
    expect(summariseModifier({ ...m, levels: 3 } as typeof m)).toBe(
      "Smooth, 3 levels",
    );
  });

  it("deformMesh applies it, and a switched-off one does nothing", () => {
    const cube = box(1);
    const on = deformMesh(cube, [createModifier("s", "subdivide")]);
    expect(count(on)).toBe(26);
    const off = deformMesh(cube, [
      { ...createModifier("s", "subdivide"), enabled: false },
    ]);
    expect(count(off)).toBe(24);
  });

  it("works after other modifiers, and its levels are kept in range", () => {
    const sub = createModifier("s", "subdivide");
    expect(sanitizeModifierChange(sub, { levels: 9 })).toEqual({ levels: 3 });
    expect(sanitizeModifierChange(sub, { levels: 0 })).toEqual({ levels: 1 });
    expect(sanitizeModifierChange(sub, { levels: 2.4 })).toEqual({ levels: 2 });
    // an angle is not a setting of this kind, and neither is an axis
    expect(sanitizeModifierChange(sub, { angle: 10, axis: "x" })).toEqual({});
  });
});
