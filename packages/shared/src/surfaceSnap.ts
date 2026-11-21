/** A surface as points and triangles (three point numbers each). */
export type Surface = {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
};

export type V3 = [number, number, number];

/** The closest point to p on the triangle abc (Ericson, Real-Time Collision Detection). */
export function closestPointOnTriangle(p: V3, a: V3, b: V3, c: V3): V3 {
  const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap: V3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u: V3, v: V3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp: V3 = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v];
  }
  const cp: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [
      b[0] + (c[0] - b[0]) * w,
      b[1] + (c[1] - b[1]) * w,
      b[2] + (c[2] - b[2]) * w,
    ];
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return [
    a[0] + ab[0] * v + ac[0] * w,
    a[1] + ab[1] * v + ac[1] * w,
    a[2] + ab[2] * v + ac[2] * w,
  ];
}

/**
 * Finds the closest point on a surface for many query points. The surface triangles are sorted into a uniform grid
 * once, then each query looks at the cell it is in and widens the search ring by ring until nothing closer can exist,
 * so a dense target (100 000 triangles) with a few thousand queries stays fast. Returns null for a surface with no
 * triangles. Result: x, y, z for every query point, in the same space as the surface.
 */
export function nearestSurfacePoints(
  surface: Surface,
  queries: ArrayLike<number>,
): Float32Array | null {
  const triangles = surface.indices.length / 3;
  if (triangles === 0) return null;
  const pos = surface.positions;
  const at = (p: number): V3 => [pos[p * 3]!, pos[p * 3 + 1]!, pos[p * 3 + 2]!];

  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, pos[i + k]!);
      max[k] = Math.max(max[k]!, pos[i + k]!);
    }
  }
  // About two triangles per cell, at least one cell per axis
  const size = Math.max(
    max[0] - min[0],
    max[1] - min[1],
    max[2] - min[2],
    1e-9,
  );
  const perAxis = Math.max(1, Math.round(Math.cbrt(triangles / 2)));
  const cell = size / perAxis;
  const counts: V3 = [
    Math.max(1, Math.ceil((max[0] - min[0]) / cell)),
    Math.max(1, Math.ceil((max[1] - min[1]) / cell)),
    Math.max(1, Math.ceil((max[2] - min[2]) / cell)),
  ];
  const cellIndex = (x: number, y: number, z: number) =>
    (z * counts[1] + y) * counts[0] + x;
  const clampCell = (v: number, axis: number) =>
    Math.min(
      counts[axis]! - 1,
      Math.max(0, Math.floor((v - min[axis]!) / cell)),
    );

  const bins = new Map<number, number[]>();
  for (let t = 0; t < triangles; t++) {
    const corners = [
      at(surface.indices[t * 3]!),
      at(surface.indices[t * 3 + 1]!),
      at(surface.indices[t * 3 + 2]!),
    ];
    const lo = [0, 1, 2].map((k) =>
      clampCell(Math.min(corners[0]![k]!, corners[1]![k]!, corners[2]![k]!), k),
    );
    const hi = [0, 1, 2].map((k) =>
      clampCell(Math.max(corners[0]![k]!, corners[1]![k]!, corners[2]![k]!), k),
    );
    for (let z = lo[2]!; z <= hi[2]!; z++)
      for (let y = lo[1]!; y <= hi[1]!; y++)
        for (let x = lo[0]!; x <= hi[0]!; x++) {
          const key = cellIndex(x, y, z);
          const list = bins.get(key);
          if (list) list.push(t);
          else bins.set(key, [t]);
        }
  }

  const out = new Float32Array(queries.length);
  const seen = new Int32Array(triangles).fill(-1);
  const maxRing = Math.max(counts[0], counts[1], counts[2]);
  for (let q = 0; q < queries.length / 3; q++) {
    const p: V3 = [queries[q * 3]!, queries[q * 3 + 1]!, queries[q * 3 + 2]!];
    const home = [0, 1, 2].map((k) => clampCell(p[k]!, k));
    let best = Infinity;
    let bestPoint: V3 = p;
    for (let ring = 0; ring <= maxRing; ring++) {
      // Every cell in this ring is at least (ring - 1) cells from the query's own cell, so once the best distance
      // is within what the NEXT ring could offer (ring * cell), nothing closer is left
      if (best <= (ring - 1) * cell && ring > 0) break;
      for (let z = home[2]! - ring; z <= home[2]! + ring; z++) {
        if (z < 0 || z >= counts[2]) continue;
        for (let y = home[1]! - ring; y <= home[1]! + ring; y++) {
          if (y < 0 || y >= counts[1]) continue;
          for (let x = home[0]! - ring; x <= home[0]! + ring; x++) {
            if (x < 0 || x >= counts[0]) continue;
            // Only the shell of the ring (inner cells were visited before)
            if (
              Math.max(
                Math.abs(x - home[0]!),
                Math.abs(y - home[1]!),
                Math.abs(z - home[2]!),
              ) !== ring
            )
              continue;
            const list = bins.get(cellIndex(x, y, z));
            if (!list) continue;
            for (const t of list) {
              if (seen[t] === q) continue;
              seen[t] = q;
              const c = closestPointOnTriangle(
                p,
                at(surface.indices[t * 3]!),
                at(surface.indices[t * 3 + 1]!),
                at(surface.indices[t * 3 + 2]!),
              );
              const d = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]);
              if (d < best) {
                best = d;
                bestPoint = c;
              }
            }
          }
        }
      }
    }
    out.set(bestPoint, q * 3);
  }
  return out;
}

/**
 * Pulls the chosen points of a mesh onto a target surface (both in the same space): each moves to the closest point
 * of the target. Returns the new point list (the other points are copied unchanged), or null if the target has no
 * triangles. `chosen` are point numbers.
 */
export function shrinkwrapPoints(
  positions: Float32Array,
  chosen: readonly number[],
  target: Surface,
): Float32Array | null {
  const queries = new Float32Array(chosen.length * 3);
  chosen.forEach((p, i) =>
    queries.set(positions.subarray(p * 3, p * 3 + 3), i * 3),
  );
  const snapped = nearestSurfacePoints(target, queries);
  if (!snapped) return null;
  const out = new Float32Array(positions);
  chosen.forEach((p, i) => out.set(snapped.subarray(i * 3, i * 3 + 3), p * 3));
  return out;
}

/** The most ray-and-triangle tests one From centre wrap may make (points times triangles), so a huge target cannot freeze the page. */
export const MAX_RAY_TESTS = 300_000_000;

/** Where a ray from `origin` along `dir` (unit length) first meets the triangle abc in front of it, as a distance, or null. */
function rayHitsTriangle(
  origin: V3,
  dir: V3,
  a: V3,
  b: V3,
  c: V3,
): number | null {
  const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const h: V3 = [
    dir[1] * e2[2] - dir[2] * e2[1],
    dir[2] * e2[0] - dir[0] * e2[2],
    dir[0] * e2[1] - dir[1] * e2[0],
  ];
  const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
  if (Math.abs(det) < 1e-12) return null; // parallel to the triangle
  const f = 1 / det;
  const s: V3 = [origin[0] - a[0], origin[1] - a[1], origin[2] - a[2]];
  const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  const q: V3 = [
    s[1] * e1[2] - s[2] * e1[1],
    s[2] * e1[0] - s[0] * e1[2],
    s[0] * e1[1] - s[1] * e1[0],
  ];
  const v = f * (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]);
  if (v < -1e-9 || u + v > 1 + 1e-9) return null;
  const t = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
  return t > 1e-9 ? t : null;
}

export type CentreWrap =
  | {
      ok: true;
      positions: Float32Array;
      /** How many points had no surface in their direction and went to the closest spot instead. */
      missed: number;
    }
  | { ok: false; reason: string };

/**
 * Pushes the chosen points straight out from `centre` (or in) until they meet the target surface: each point moves along
 * the line from the centre through it to the first place that line meets the target. A mesh in the middle of a bigger
 * shape therefore inflates to cover it whatever its own size or position. A point exactly at the centre, or whose line
 * meets nothing (the target does not surround it in that direction), goes to the closest spot of the target instead.
 */
export function shrinkwrapFromCentre(
  positions: Float32Array,
  chosen: readonly number[],
  centre: readonly [number, number, number],
  target: Surface,
): CentreWrap {
  const triangles = target.indices.length / 3;
  if (triangles === 0) {
    return { ok: false, reason: "The target has no surface to wrap onto." };
  }
  if (chosen.length * triangles > MAX_RAY_TESTS) {
    return {
      ok: false,
      reason:
        "That is too much to wrap from the centre in one go (too many points on a target with too many triangles). Select fewer points, or use Nearest surface.",
    };
  }
  const tp = target.positions;
  const at = (p: number): V3 => [tp[p * 3]!, tp[p * 3 + 1]!, tp[p * 3 + 2]!];
  const corners: V3[][] = [];
  for (let t = 0; t < triangles; t++) {
    corners.push([
      at(target.indices[t * 3]!),
      at(target.indices[t * 3 + 1]!),
      at(target.indices[t * 3 + 2]!),
    ]);
  }
  const origin: V3 = [centre[0], centre[1], centre[2]];
  const out = new Float32Array(positions);
  const lost: number[] = [];
  for (const p of chosen) {
    const d: V3 = [
      positions[p * 3]! - origin[0],
      positions[p * 3 + 1]! - origin[1],
      positions[p * 3 + 2]! - origin[2],
    ];
    const length = Math.hypot(d[0], d[1], d[2]);
    if (length < 1e-9) {
      lost.push(p);
      continue;
    }
    const dir: V3 = [d[0] / length, d[1] / length, d[2] / length];
    let best = Infinity;
    for (const [a, b, c] of corners) {
      const t = rayHitsTriangle(origin, dir, a!, b!, c!);
      if (t !== null && t < best) best = t;
    }
    if (best === Infinity) {
      lost.push(p);
      continue;
    }
    out[p * 3] = origin[0] + dir[0] * best;
    out[p * 3 + 1] = origin[1] + dir[1] * best;
    out[p * 3 + 2] = origin[2] + dir[2] * best;
  }
  if (lost.length > 0) {
    const fallback = shrinkwrapPoints(out, lost, target);
    if (fallback) return { ok: true, positions: fallback, missed: lost.length };
  }
  return { ok: true, positions: out, missed: lost.length };
}
