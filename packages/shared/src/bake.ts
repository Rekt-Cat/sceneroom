import { weldGroups } from "./meshEdit";
import { buildRayMesh } from "./rayMesh";

/**
 * Baking: copying the detail of a dense mesh ("high") onto a simple one ("low") as a picture, so the simple mesh LOOKS
 * as detailed. The first kind is a normal map: for every pixel of the low mesh's UV map, a ray goes from just outside
 * the low surface inwards; where it meets the high mesh, the direction that surface faces is written into the pixel
 * (red, green, blue = x, y, z of the normal, in the low surface's own frame, 0 to 1 for -1 to 1).
 */

/** Two faces smooth into each other (share one normal at a corner) when they turn less than this many degrees. */
export const SMOOTH_ANGLE_DEGREES = 60;

/** The pixel of a surface facing straight out: the picture of "no detail". */
export const FLAT_NORMAL_PIXEL = [128, 128, 255, 255] as const;

/**
 * The normal at every corner of every triangle (three numbers per corner, nine per triangle). Faces that meet at a
 * point and turn less than `smoothDegrees` from each other share a smooth normal there, so curves are smooth and sharp
 * edges stay sharp. Points on the same spot count as one (a cube has three points at each corner).
 */
export function cornerNormals(
  positions: Float32Array,
  indices: Uint32Array,
  smoothDegrees = SMOOTH_ANGLE_DEGREES,
): Float32Array {
  const triangles = indices.length / 3;
  const face = new Float32Array(triangles * 3);
  const area = new Float32Array(triangles);
  for (let t = 0; t < triangles; t++) {
    const a = indices[t * 3]! * 3;
    const b = indices[t * 3 + 1]! * 3;
    const c = indices[t * 3 + 2]! * 3;
    const e1 = [
      positions[b]! - positions[a]!,
      positions[b + 1]! - positions[a + 1]!,
      positions[b + 2]! - positions[a + 2]!,
    ];
    const e2 = [
      positions[c]! - positions[a]!,
      positions[c + 1]! - positions[a + 1]!,
      positions[c + 2]! - positions[a + 2]!,
    ];
    const x = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
    const y = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
    const z = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
    const length = Math.hypot(x, y, z);
    area[t] = length / 2;
    if (length > 0) {
      face[t * 3] = x / length;
      face[t * 3 + 1] = y / length;
      face[t * 3 + 2] = z / length;
    }
  }
  const groups = weldGroups(positions);
  // The triangles that touch each spot
  const around: number[][] = Array.from(
    { length: groups.members.length },
    () => [],
  );
  for (let i = 0; i < indices.length; i++) {
    around[groups.ids[indices[i]!]!]!.push(Math.floor(i / 3));
  }
  const limit = Math.cos((smoothDegrees * Math.PI) / 180);
  const out = new Float32Array(indices.length * 3);
  for (let t = 0; t < triangles; t++) {
    for (let corner = 0; corner < 3; corner++) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const other of around[groups.ids[indices[t * 3 + corner]!]!]!) {
        const dot =
          face[t * 3]! * face[other * 3]! +
          face[t * 3 + 1]! * face[other * 3 + 1]! +
          face[t * 3 + 2]! * face[other * 3 + 2]!;
        if (dot < limit) continue;
        x += face[other * 3]! * area[other]!;
        y += face[other * 3 + 1]! * area[other]!;
        z += face[other * 3 + 2]! * area[other]!;
      }
      let length = Math.hypot(x, y, z);
      if (length === 0) {
        x = face[t * 3]!;
        y = face[t * 3 + 1]!;
        z = face[t * 3 + 2]!;
        length = Math.hypot(x, y, z) || 1;
      }
      const at = (t * 3 + corner) * 3;
      out[at] = x / length;
      out[at + 1] = y / length;
      out[at + 2] = z / length;
    }
  }
  return out;
}

export type NormalBakeOptions = {
  /** Width and height of the picture, in pixels. */
  size: number;
  /** How far above the low surface the rays start, and (twice) how far they look: the "cage". In the low mesh's own units. */
  distance: number;
  /** How many pixels the picture is spread past the edges of the map pieces, so seams do not show (default 4). */
  padding?: number;
};

export type NormalBake = {
  size: number;
  /** The picture (red, green, blue, alpha per pixel, top row first). Complete once `step` has returned true. */
  pixels: Uint8ClampedArray;
  /** Does some work (about `texels` pixels). Returns true when the whole picture is done. */
  step: (texels: number) => boolean;
  /** 0 to 1. */
  progress: () => number;
  /** Pixels where a ray hit the high mesh, and where none did (those stay flat). */
  stats: () => { hits: number; misses: number };
};

type V3 = [number, number, number];

const normalize = (v: V3): V3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Starts baking a normal map of `high` onto `low`. `low` needs a UV map; `high` is in the same space as `low` (the caller
 * brings it there). The work is done in small steps (`step`), so the page can stay alive and show progress.
 */
export function startNormalBake(
  low: {
    positions: Float32Array;
    indices: Uint32Array;
    uvs: Float32Array;
  },
  high: { positions: Float32Array; indices: Uint32Array },
  options: NormalBakeOptions,
): NormalBake {
  const { size, distance } = options;
  const padding = options.padding ?? 4;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = FLAT_NORMAL_PIXEL[0];
    pixels[i + 1] = FLAT_NORMAL_PIXEL[1];
    pixels[i + 2] = FLAT_NORMAL_PIXEL[2];
    pixels[i + 3] = 255;
  }
  const covered = new Uint8Array(size * size);
  const caster = buildRayMesh(high.positions, high.indices);
  const lowNormals = cornerNormals(low.positions, low.indices);
  const highNormals = cornerNormals(high.positions, high.indices);
  const triangles = low.indices.length / 3;
  let hits = 0;
  let misses = 0;
  let trianglesDone = 0;

  function bakeTexel(
    t: number,
    weights: V3,
    p: [V3, V3, V3],
    tangent: V3,
    bitangent: V3,
  ): V3 | null {
    const lowCorner = (corner: number): V3 => [
      lowNormals[(t * 3 + corner) * 3]!,
      lowNormals[(t * 3 + corner) * 3 + 1]!,
      lowNormals[(t * 3 + corner) * 3 + 2]!,
    ];
    const n0 = lowCorner(0);
    const n1 = lowCorner(1);
    const n2 = lowCorner(2);
    const normal = normalize([
      n0[0] * weights[0] + n1[0] * weights[1] + n2[0] * weights[2],
      n0[1] * weights[0] + n1[1] * weights[1] + n2[1] * weights[2],
      n0[2] * weights[0] + n1[2] * weights[1] + n2[2] * weights[2],
    ]);
    const point: V3 = [
      p[0][0] * weights[0] + p[1][0] * weights[1] + p[2][0] * weights[2],
      p[0][1] * weights[0] + p[1][1] * weights[1] + p[2][1] * weights[2],
      p[0][2] * weights[0] + p[1][2] * weights[1] + p[2][2] * weights[2],
    ];
    const origin: V3 = [
      point[0] + normal[0] * distance,
      point[1] + normal[1] * distance,
      point[2] + normal[2] * distance,
    ];
    const hit = caster.raycast(
      origin,
      [-normal[0], -normal[1], -normal[2]],
      distance * 2,
    );
    if (!hit) return null;
    const w = 1 - hit.u - hit.v;
    const corner = (c: number): V3 => [
      highNormals[(hit.triangle * 3 + c) * 3]!,
      highNormals[(hit.triangle * 3 + c) * 3 + 1]!,
      highNormals[(hit.triangle * 3 + c) * 3 + 2]!,
    ];
    const h0 = corner(0);
    const h1 = corner(1);
    const h2 = corner(2);
    let n = normalize([
      h0[0] * w + h1[0] * hit.u + h2[0] * hit.v,
      h0[1] * w + h1[1] * hit.u + h2[1] * hit.v,
      h0[2] * w + h1[2] * hit.u + h2[2] * hit.v,
    ]);
    // A hit on the back of a surface: turn the normal round so it faces the low surface's side
    if (dot(n, normal) < 0) n = [-n[0], -n[1], -n[2]];
    return [dot(n, tangent), dot(n, bitangent), dot(n, normal)];
  }

  function* work(): Generator<void> {
    const uv = low.uvs;
    const pos = low.positions;
    for (let t = 0; t < triangles; t++) {
      trianglesDone = t;
      const idx = [
        low.indices[t * 3]!,
        low.indices[t * 3 + 1]!,
        low.indices[t * 3 + 2]!,
      ] as const;
      const p = idx.map(
        (i) => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!] as V3,
      ) as [V3, V3, V3];
      // Corners on the picture (pixels; v = 1 is the top row)
      const px = idx.map((i) => uv[i * 2]! * size);
      const py = idx.map((i) => (1 - uv[i * 2 + 1]!) * size);
      const det =
        (px[1]! - px[0]!) * (py[2]! - py[0]!) -
        (px[2]! - px[0]!) * (py[1]! - py[0]!);
      if (Math.abs(det) < 1e-9) continue; // no area on the map
      // Which way the surface runs along u and along v (for the frame the normals are written in)
      const du1 = uv[idx[1] * 2]! - uv[idx[0] * 2]!;
      const dv1 = uv[idx[1] * 2 + 1]! - uv[idx[0] * 2 + 1]!;
      const du2 = uv[idx[2] * 2]! - uv[idx[0] * 2]!;
      const dv2 = uv[idx[2] * 2 + 1]! - uv[idx[0] * 2 + 1]!;
      const uvDet = du1 * dv2 - du2 * dv1;
      const dp1: V3 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
      const dp2: V3 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const tangentRaw: V3 = [
        (dp1[0] * dv2 - dp2[0] * dv1) / uvDet,
        (dp1[1] * dv2 - dp2[1] * dv1) / uvDet,
        (dp1[2] * dv2 - dp2[2] * dv1) / uvDet,
      ];
      const bitangentRaw: V3 = [
        (dp2[0] * du1 - dp1[0] * du2) / uvDet,
        (dp2[1] * du1 - dp1[1] * du2) / uvDet,
        (dp2[2] * du1 - dp1[2] * du2) / uvDet,
      ];
      const x0 = Math.max(0, Math.floor(Math.min(px[0]!, px[1]!, px[2]!)));
      const x1 = Math.min(
        size - 1,
        Math.ceil(Math.max(px[0]!, px[1]!, px[2]!)),
      );
      const y0 = Math.max(0, Math.floor(Math.min(py[0]!, py[1]!, py[2]!)));
      const y1 = Math.min(
        size - 1,
        Math.ceil(Math.max(py[0]!, py[1]!, py[2]!)),
      );
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const cx = x + 0.5;
          const cy = y + 0.5;
          const w1 =
            ((cx - px[0]!) * (py[2]! - py[0]!) -
              (px[2]! - px[0]!) * (cy - py[0]!)) /
            det;
          const w2 =
            ((px[1]! - px[0]!) * (cy - py[0]!) -
              (cx - px[0]!) * (py[1]! - py[0]!)) /
            det;
          const w0 = 1 - w1 - w2;
          const eps = -1e-6;
          if (w0 < eps || w1 < eps || w2 < eps) continue;
          // The frame at this pixel: the tangent turned square to the smooth normal
          const weights: V3 = [w0, w1, w2];
          const nHere = normalize([
            lowNormals[t * 9]! * w0 +
              lowNormals[t * 9 + 3]! * w1 +
              lowNormals[t * 9 + 6]! * w2,
            lowNormals[t * 9 + 1]! * w0 +
              lowNormals[t * 9 + 4]! * w1 +
              lowNormals[t * 9 + 7]! * w2,
            lowNormals[t * 9 + 2]! * w0 +
              lowNormals[t * 9 + 5]! * w1 +
              lowNormals[t * 9 + 8]! * w2,
          ]);
          const d = dot(nHere, tangentRaw);
          const tangent = normalize([
            tangentRaw[0] - nHere[0] * d,
            tangentRaw[1] - nHere[1] * d,
            tangentRaw[2] - nHere[2] * d,
          ]);
          let bitangent = cross(nHere, tangent);
          if (dot(bitangent, bitangentRaw) < 0)
            bitangent = [-bitangent[0], -bitangent[1], -bitangent[2]];
          const result = bakeTexel(t, weights, p, tangent, bitangent);
          const at = (y * size + x) * 4;
          covered[y * size + x] = 1;
          if (result) {
            hits++;
            pixels[at] = Math.round((result[0] * 0.5 + 0.5) * 255);
            pixels[at + 1] = Math.round((result[1] * 0.5 + 0.5) * 255);
            pixels[at + 2] = Math.round((result[2] * 0.5 + 0.5) * 255);
          } else {
            misses++;
          }
          yield;
        }
      }
    }
    trianglesDone = triangles;
    spread(pixels, covered, size, padding);
  }

  const job = work();
  let finished = false;
  return {
    size,
    pixels,
    step(texels) {
      if (finished) return true;
      for (let i = 0; i < texels; i++) {
        if (job.next().done) {
          finished = true;
          return true;
        }
      }
      return false;
    },
    progress: () => (finished ? 1 : trianglesDone / Math.max(1, triangles)),
    stats: () => ({ hits, misses }),
  };
}

/** Copies the colour of the pixels at the edge of the map pieces outwards by `passes` pixels (so seams and smooth filtering do not show the flat colour). */
function spread(
  pixels: Uint8ClampedArray,
  covered: Uint8Array,
  size: number,
  passes: number,
): void {
  for (let pass = 0; pass < passes; pass++) {
    const added: number[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const here = y * size + x;
        if (covered[here]) continue;
        const from = [
          x > 0 ? here - 1 : -1,
          x < size - 1 ? here + 1 : -1,
          y > 0 ? here - size : -1,
          y < size - 1 ? here + size : -1,
        ].find((n) => n >= 0 && covered[n] === 1);
        if (from === undefined) continue;
        pixels[here * 4] = pixels[from * 4]!;
        pixels[here * 4 + 1] = pixels[from * 4 + 1]!;
        pixels[here * 4 + 2] = pixels[from * 4 + 2]!;
        added.push(here);
      }
    }
    // Marked after the pass, so each pass grows the edge by one pixel only
    for (const here of added) covered[here] = 1;
  }
}
