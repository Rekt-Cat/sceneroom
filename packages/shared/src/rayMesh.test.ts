import { describe, expect, it } from "vitest";
import { buildRayMesh } from "./rayMesh";

/** A grid of n x n squares in the plane z = 0, two triangles each, from (0,0) to (n,n). */
function grid(n: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= n; y++) {
    for (let x = 0; x <= n; x++) positions.push(x, y, 0);
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = y * (n + 1) + x;
      indices.push(a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1);
    }
  }
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
  };
}

describe("buildRayMesh", () => {
  it("finds where a ray meets a flat grid, and which triangle", () => {
    const { positions, indices } = grid(8);
    const mesh = buildRayMesh(positions, indices);
    const hit = mesh.raycast([3.25, 2.25, 5], [0, 0, -1], 10);
    expect(hit?.t).toBeCloseTo(5);
    // The lower-right triangle of the square at x = 3, y = 2 (a, a + 1, a + n + 1)
    const a = 2 * 9 + 3;
    const corners = [
      indices[hit!.triangle * 3],
      indices[hit!.triangle * 3 + 1],
      indices[hit!.triangle * 3 + 2],
    ];
    expect(corners).toContain(a);
    // The barycentric coordinates give back the hit point
    const [i0, i1, i2] = corners as [number, number, number];
    const x =
      positions[i0 * 3]! +
      hit!.u * (positions[i1 * 3]! - positions[i0 * 3]!) +
      hit!.v * (positions[i2 * 3]! - positions[i0 * 3]!);
    expect(x).toBeCloseTo(3.25);
  });

  it("misses outside the grid, beyond the range and pointing away", () => {
    const { positions, indices } = grid(4);
    const mesh = buildRayMesh(positions, indices);
    expect(mesh.raycast([10, 10, 5], [0, 0, -1], 10)).toBeNull();
    expect(mesh.raycast([2, 2, 5], [0, 0, -1], 4)).toBeNull();
    expect(mesh.raycast([2, 2, 5], [0, 0, 1], 10)).toBeNull();
  });

  it("returns the nearest of two stacked surfaces", () => {
    const a = grid(2);
    const positions = new Float32Array([
      ...a.positions,
      ...a.positions.map((v, i) => (i % 3 === 2 ? 1 : v)),
    ]);
    const indices = new Uint32Array([
      ...a.indices,
      ...a.indices.map((v) => v + a.positions.length / 3),
    ]);
    const mesh = buildRayMesh(positions, indices);
    expect(mesh.raycast([1.1, 1.1, 5], [0, 0, -1], 10)?.t).toBeCloseTo(4);
    expect(mesh.raycast([1.1, 1.1, -5], [0, 0, 1], 10)?.t).toBeCloseTo(5);
  });

  it("agrees with a brute-force search on many random rays", () => {
    // A bumpy surface of 20 x 20 squares
    const n = 20;
    const { positions, indices } = grid(n);
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3 + 2] =
        Math.sin(positions[i * 3]! * 0.7) *
        Math.cos(positions[i * 3 + 1]! * 0.9);
    }
    const mesh = buildRayMesh(positions, indices);
    const brute = buildRayMesh(positions, indices.slice(0, 0));
    expect(brute.raycast([0, 0, 5], [0, 0, -1], 10)).toBeNull();
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      const origin: [number, number, number] = [random() * n, random() * n, 4];
      const dir: [number, number, number] = [
        (random() - 0.5) * 0.3,
        (random() - 0.5) * 0.3,
        -1,
      ];
      const length = Math.hypot(...dir);
      const unit: [number, number, number] = [
        dir[0] / length,
        dir[1] / length,
        dir[2] / length,
      ];
      const fast = mesh.raycast(origin, unit, 20);
      let best = Infinity;
      for (let t = 0; t < indices.length / 3; t++) {
        const single = buildRayMesh(
          positions,
          indices.slice(t * 3, t * 3 + 3),
        ).raycast(origin, unit, 20);
        if (single && single.t < best) best = single.t;
      }
      if (best === Infinity) expect(fast).toBeNull();
      else {
        hits++;
        expect(fast?.t).toBeCloseTo(best, 4);
      }
    }
    expect(hits).toBeGreaterThan(100);
  });
});
