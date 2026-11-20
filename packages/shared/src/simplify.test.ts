import { describe, expect, it } from "vitest";
import { checkMesh } from "./meshData";
import type { EditMesh } from "./meshEdit";
import { simplifyMesh } from "./simplify";

/** A flat n by n grid of squares in the x-z plane, from 0 to n, two triangles each. */
function grid(n: number): EditMesh {
  const positions: number[] = [];
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) positions.push(x, 0, z);
  const indices: number[] = [];
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const a = z * (n + 1) + x;
      indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  }
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
  };
}

/** A closed sphere of radius 1 made of rings and sectors (welded, with poles). */
function sphere(rings: number, sectors: number): EditMesh {
  const positions: number[] = [0, 1, 0];
  for (let r = 1; r < rings; r++) {
    const phi = (Math.PI * r) / rings;
    for (let s = 0; s < sectors; s++) {
      const theta = (2 * Math.PI * s) / sectors;
      positions.push(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      );
    }
  }
  positions.push(0, -1, 0);
  const south = positions.length / 3 - 1;
  const ring = (r: number, s: number) => 1 + (r - 1) * sectors + (s % sectors);
  const indices: number[] = [];
  for (let s = 0; s < sectors; s++) indices.push(0, ring(1, s + 1), ring(1, s));
  for (let r = 1; r < rings - 1; r++) {
    for (let s = 0; s < sectors; s++) {
      indices.push(ring(r, s), ring(r, s + 1), ring(r + 1, s));
      indices.push(ring(r, s + 1), ring(r + 1, s + 1), ring(r + 1, s));
    }
  }
  for (let s = 0; s < sectors; s++)
    indices.push(south, ring(rings - 1, s), ring(rings - 1, s + 1));
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
  };
}

/** How many edges are used by exactly one triangle, and by more than two. */
function edgeCounts(mesh: EditMesh) {
  const use = new Map<string, number>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[t + k]!;
      const b = mesh.indices[t + ((k + 1) % 3)]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      use.set(key, (use.get(key) ?? 0) + 1);
    }
  }
  const counts = [...use.values()];
  return {
    open: counts.filter((c) => c === 1).length,
    crowded: counts.filter((c) => c > 2).length,
  };
}

const bounds = (mesh: EditMesh) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3]!, mesh.positions[i]!);
    max[i % 3] = Math.max(max[i % 3]!, mesh.positions[i]!);
  }
  return { min, max };
};

describe("simplifyMesh", () => {
  it("reduces a flat grid to about the target and keeps its outline and flatness", () => {
    const mesh = grid(20); // 800 triangles
    const out = simplifyMesh(mesh, 200);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.triangles).toBeLessThanOrEqual(220);
    expect(out.triangles).toBeLessThan(800);
    expect(checkMesh(out.mesh)).toBeNull();
    // The border points never move, so the outline is the same; a flat surface stays flat
    expect(bounds(out.mesh)).toEqual(bounds(mesh));
    for (let p = 0; p < out.mesh.positions.length / 3; p++)
      expect(out.mesh.positions[p * 3 + 1]).toBeCloseTo(0, 6);
    // Still one sheet: no edge is shared by three triangles
    expect(edgeCounts(out.mesh).crowded).toBe(0);
  });

  it("keeps a closed sphere closed and round", () => {
    const mesh = sphere(24, 32); // 1 472 triangles
    const out = simplifyMesh(mesh, 400);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.triangles).toBeLessThanOrEqual(420);
    expect(checkMesh(out.mesh)).toBeNull();
    expect(edgeCounts(out.mesh)).toEqual({ open: 0, crowded: 0 });
    // The points stay near the unit sphere (collapses pick the cheapest spot, so some drift is fine)
    let worst = 0;
    for (let p = 0; p < out.mesh.positions.length / 3; p++) {
      const r = Math.hypot(
        out.mesh.positions[p * 3]!,
        out.mesh.positions[p * 3 + 1]!,
        out.mesh.positions[p * 3 + 2]!,
      );
      worst = Math.max(worst, Math.abs(r - 1));
    }
    expect(worst).toBeLessThan(0.15);
  });

  it("never moves a point on the border", () => {
    const mesh = grid(12);
    const out = simplifyMesh(mesh, 60);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const kept = new Set<string>();
    for (let p = 0; p < out.mesh.positions.length / 3; p++) {
      kept.add(`${out.mesh.positions[p * 3]},${out.mesh.positions[p * 3 + 2]}`);
    }
    // Every point of the outline is still there, exactly where it was
    for (let i = 0; i <= 12; i++) {
      for (const [x, z] of [
        [i, 0],
        [i, 12],
        [0, i],
        [12, i],
      ] as const) {
        expect(kept.has(`${x},${z}`)).toBe(true);
      }
    }
  });

  it("refuses when the mesh is not bigger than the target", () => {
    const out = simplifyMesh(grid(2), 100);
    expect(out.ok).toBe(false);
  });

  it("never goes below the smallest size", () => {
    const out = simplifyMesh(sphere(8, 8), 1);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.triangles).toBeGreaterThanOrEqual(4);
  });

  it("leaves a shape of separate faces with its hard edges (a cube of grids keeps its corners)", () => {
    // Six grids placed as the faces of a cube, each with its own points: every rim is a border, so nothing on it moves
    const faces: EditMesh[] = [];
    const place = (
      g: EditMesh,
      f: (x: number, y: number, z: number) => [number, number, number],
    ) => {
      const positions = new Float32Array(g.positions.length);
      for (let p = 0; p < g.positions.length / 3; p++) {
        positions.set(
          f(
            g.positions[p * 3]!,
            g.positions[p * 3 + 1]!,
            g.positions[p * 3 + 2]!,
          ),
          p * 3,
        );
      }
      faces.push({ positions, indices: g.indices });
    };
    const g = grid(8);
    place(g, (x, y, z) => [x, 0, z]);
    place(g, (x, y, z) => [x, 8, z]);
    place(g, (x, y, z) => [x, z, 0]);
    place(g, (x, y, z) => [x, z, 8]);
    place(g, (x, y, z) => [0, x, z]);
    place(g, (x, y, z) => [8, x, z]);
    let offset = 0;
    const positions: number[] = [];
    const indices: number[] = [];
    for (const f of faces) {
      positions.push(...f.positions);
      for (const i of f.indices) indices.push(i + offset);
      offset += f.positions.length / 3;
    }
    const cube = {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
    };
    const out = simplifyMesh(cube, 100);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(bounds(out.mesh)).toEqual({ min: [0, 0, 0], max: [8, 8, 8] });
    expect(checkMesh(out.mesh)).toBeNull();
  });
});
