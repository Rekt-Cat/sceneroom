/** Small meshes built by hand for tests: grids, boxes, planes and tubes, made the way three.js makes them. */
import type { EditMesh } from "./meshEdit";

/**
 * Meshes built like three.js builds them: a grid of squares, each cut by one diagonal into two triangles
 * (a, b, d and b, c, d), and a box whose six sides do not share points (so a corner is three points).
 */
export function grid(
  nx: number,
  ny: number,
  place: (u: number, v: number) => [number, number, number],
): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let iy = 0; iy <= ny; iy++) {
    for (let ix = 0; ix <= nx; ix++) {
      positions.push(...place(ix / nx, iy / ny));
    }
  }
  const stride = nx + 1;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      indices.push(a, b, d, b, c, d);
    }
  }
  return { positions, indices };
}

export function join(
  parts: { positions: number[]; indices: number[] }[],
): EditMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const part of parts) {
    const offset = positions.length / 3;
    positions.push(...part.positions);
    indices.push(...part.indices.map((i) => i + offset));
  }
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
  };
}

/** A unit box, each side cut into n by n squares. Sides do not share points. */
export function box(n: number): EditMesh {
  const h = 0.5;
  const side = (map: (u: number, v: number) => [number, number, number]) =>
    grid(n, n, map);
  return join([
    side((u, v) => [-h + u, -h + v, h]),
    side((u, v) => [h - u, -h + v, -h]),
    side((u, v) => [h, -h + v, h - u]),
    side((u, v) => [-h, -h + v, -h + u]),
    side((u, v) => [-h + u, h, h - v]),
    side((u, v) => [-h + u, -h, -h + v]),
  ]);
}

/** A flat plane of n by n squares in the x-z plane. */
export const plane = (n: number): EditMesh =>
  join([grid(n, n, (u, v) => [u, 0, v])]);

/** A tube: `around` sides and `rings` bands, with a seam (the first and last column are separate points). */
export function tube(around: number, rings: number, caps = false): EditMesh {
  const parts = [
    grid(around, rings, (u, v) => [
      Math.cos(u * 2 * Math.PI),
      v * 2,
      Math.sin(u * 2 * Math.PI),
    ]),
  ];
  if (caps) {
    for (const y of [0, 2]) {
      // A fan: a middle point and one triangle per side
      const positions = [0, y, 0];
      const indices: number[] = [];
      for (let i = 0; i < around; i++) {
        const angle = (i / around) * 2 * Math.PI;
        positions.push(Math.cos(angle), y, Math.sin(angle));
      }
      for (let i = 0; i < around; i++) {
        indices.push(0, 1 + i, 1 + ((i + 1) % around));
      }
      parts.push({ positions, indices });
    }
  }
  return join(parts);
}
