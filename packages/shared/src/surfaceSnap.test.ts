import { describe, expect, it } from "vitest";
import {
  closestPointOnTriangle,
  nearestSurfacePoints,
  shrinkwrapFromCentre,
  shrinkwrapPoints,
  type V3,
} from "./surfaceSnap";

/** A flat square from (0,0,0) to (1,0,1), two triangles. */
const square = {
  positions: [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
  indices: [0, 2, 1, 0, 3, 2],
};

/** A unit sphere from rings and sectors, to compare the grid search with brute force. */
function sphere(rings: number, sectors: number) {
  const positions: number[] = [0, 1, 0];
  for (let r = 1; r < rings; r++) {
    const phi = (Math.PI * r) / rings;
    for (let s = 0; s < sectors; s++) {
      const th = (2 * Math.PI * s) / sectors;
      positions.push(
        Math.sin(phi) * Math.cos(th),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(th),
      );
    }
  }
  positions.push(0, -1, 0);
  const south = positions.length / 3 - 1;
  const ring = (r: number, s: number) => 1 + (r - 1) * sectors + (s % sectors);
  const indices: number[] = [];
  for (let s = 0; s < sectors; s++) indices.push(0, ring(1, s + 1), ring(1, s));
  for (let r = 1; r < rings - 1; r++)
    for (let s = 0; s < sectors; s++) {
      indices.push(ring(r, s), ring(r, s + 1), ring(r + 1, s));
      indices.push(ring(r, s + 1), ring(r + 1, s + 1), ring(r + 1, s));
    }
  for (let s = 0; s < sectors; s++)
    indices.push(south, ring(rings - 1, s), ring(rings - 1, s + 1));
  return { positions, indices };
}

describe("nearestSurfacePoints", () => {
  it("drops a point above a face straight down onto it", () => {
    const out = nearestSurfacePoints(square, [0.3, 2, 0.6])!;
    expect(Array.from(out)).toEqual([
      expect.closeTo(0.3),
      0,
      expect.closeTo(0.6),
    ]);
  });
  it("finds an edge and a corner for points beside the face", () => {
    const out = nearestSurfacePoints(square, [2, 1, 0.5, -1, 1, -1])!;
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(0.5);
    expect(Array.from(out.subarray(3))).toEqual([0, 0, 0]);
  });
  it("leaves a point that is already on the surface where it is", () => {
    const out = nearestSurfacePoints(square, [0.25, 0, 0.25])!;
    expect(out[0]).toBeCloseTo(0.25);
    expect(out[2]).toBeCloseTo(0.25);
  });
  it("is null for a surface with no triangles", () => {
    expect(
      nearestSurfacePoints({ positions: [], indices: [] }, [0, 0, 0]),
    ).toBeNull();
  });
  it("agrees with a brute-force search over every triangle, for points inside, outside and far away", () => {
    const s = sphere(20, 28);
    const queries: number[] = [];
    for (let i = 0; i < 60; i++) {
      const a = i * 2.399;
      const r = 0.2 + (i % 7) * 0.6;
      queries.push(Math.cos(a) * r, Math.sin(a * 1.3) * r, Math.sin(a) * r);
    }
    queries.push(40, 40, 40);
    const fast = nearestSurfacePoints(s, queries)!;
    const corner = (p: number): V3 => [
      s.positions[p * 3]!,
      s.positions[p * 3 + 1]!,
      s.positions[p * 3 + 2]!,
    ];
    for (let q = 0; q < queries.length / 3; q++) {
      const p: V3 = [queries[q * 3]!, queries[q * 3 + 1]!, queries[q * 3 + 2]!];
      let best = Infinity;
      for (let t = 0; t < s.indices.length / 3; t++) {
        const c = closestPointOnTriangle(
          p,
          corner(s.indices[t * 3]!),
          corner(s.indices[t * 3 + 1]!),
          corner(s.indices[t * 3 + 2]!),
        );
        best = Math.min(
          best,
          Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]),
        );
      }
      const got = Math.hypot(
        fast[q * 3]! - p[0],
        fast[q * 3 + 1]! - p[1],
        fast[q * 3 + 2]! - p[2],
      );
      expect(got).toBeCloseTo(best, 4);
    }
  });
});

describe("shrinkwrapPoints", () => {
  it("moves only the chosen points", () => {
    const rough = new Float32Array([0.3, 2, 0.3, 0.6, 3, 0.6, 5, 5, 5]);
    const out = shrinkwrapPoints(rough, [0, 1], square)!;
    expect(out[1]).toBeCloseTo(0);
    expect(out[4]).toBeCloseTo(0);
    expect(Array.from(out.subarray(6))).toEqual([5, 5, 5]); // not chosen
    expect(rough[1]).toBe(2); // the input is not changed
  });
  it("is null when the target has no triangles", () => {
    expect(
      shrinkwrapPoints(new Float32Array(3), [0], {
        positions: [],
        indices: [],
      }),
    ).toBeNull();
  });
});

describe("shrinkwrapFromCentre", () => {
  // A cube of points around (0.5, 0, 0): small and off centre compared with a unit sphere at the origin
  const cubeCorners = new Float32Array([
    0.4, -0.1, -0.1, 0.6, -0.1, -0.1, 0.4, 0.1, -0.1, 0.6, 0.1, -0.1, 0.4, -0.1,
    0.1, 0.6, -0.1, 0.1, 0.4, 0.1, 0.1, 0.6, 0.1, 0.1,
  ]);
  const all = [0, 1, 2, 3, 4, 5, 6, 7];

  it("pushes every point out along the line from the centre until it meets the sphere", () => {
    const s = sphere(20, 28);
    const centre: [number, number, number] = [0.5, 0, 0];
    const out = shrinkwrapFromCentre(cubeCorners, all, centre, s);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.missed).toBe(0);
    for (const p of all) {
      const r = Math.hypot(
        out.positions[p * 3]!,
        out.positions[p * 3 + 1]!,
        out.positions[p * 3 + 2]!,
      );
      expect(r).toBeGreaterThan(0.95);
      expect(r).toBeLessThan(1.0001);
      // It stayed on its own line from the centre
      const dx = cubeCorners[p * 3]! - 0.5;
      const dy = cubeCorners[p * 3 + 1]!;
      const dz = cubeCorners[p * 3 + 2]!;
      const ex = out.positions[p * 3]! - 0.5;
      const ey = out.positions[p * 3 + 1]!;
      const ez = out.positions[p * 3 + 2]!;
      const cross = Math.hypot(
        dy * ez - dz * ey,
        dz * ex - dx * ez,
        dx * ey - dy * ex,
      );
      expect(cross).toBeLessThan(1e-4);
    }
    // The corners are spread over the whole ball (some on each side of the centre), not gathered in one patch
    const xs = all.map((p) => out.positions[p * 3]!);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0.6);
  });
  it("sends a point whose line points away from the target to the closest spot, and counts it", () => {
    const out = shrinkwrapFromCentre(
      new Float32Array([0.3, -2, 0.6]),
      [0],
      [0.3, -1, 0.6],
      square,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.missed).toBe(1);
    expect(out.positions[1]).toBeCloseTo(0);
  });
  it("refuses a target with no triangles and a job that is too big", () => {
    expect(
      shrinkwrapFromCentre(new Float32Array(3), [0], [0, 0, 0], {
        positions: [],
        indices: [],
      }).ok,
    ).toBe(false);
    const big = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: new Array(3 * 300_000).fill(0).map((_, i) => i % 3),
    };
    expect(
      shrinkwrapFromCentre(
        new Float32Array(3 * 2000),
        Array.from({ length: 2000 }, (_, i) => i),
        [0, 0, -1],
        big,
      ).ok,
    ).toBe(false);
  });
  it("leaves the points that are not chosen alone", () => {
    const s = sphere(12, 16);
    const out = shrinkwrapFromCentre(cubeCorners, [0, 1], [0.5, 0, 0], s);
    expect(out.ok && Array.from(out.positions.subarray(6))).toEqual(
      Array.from(cubeCorners.subarray(6)),
    );
  });
});
