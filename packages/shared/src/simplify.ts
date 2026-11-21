import type { EditMesh } from "./meshEdit";

/** Simplify keeps at least this many triangles, whatever was asked. */
export const MIN_SIMPLIFIED_TRIANGLES = 4;
/** A collapse that would turn a neighbouring face by more than this (cosine of the angle) is refused: it would fold the surface over. */
const MIN_NORMAL_DOT = 0.2;

export type SimplifyResult =
  | {
      ok: true;
      mesh: EditMesh;
      /** How many triangles the mesh has now (it may stop above the target if no safe collapse is left). */
      triangles: number;
    }
  | { ok: false; reason: string };

type V3 = [number, number, number];

/** The quadric of a plane (a, b, c, d) as the 10 numbers of a symmetric 4 by 4 matrix, scaled by `weight`. */
function planeQuadric(a: number, b: number, c: number, d: number, w: number) {
  return [
    a * a * w,
    a * b * w,
    a * c * w,
    a * d * w,
    b * b * w,
    b * c * w,
    b * d * w,
    c * c * w,
    c * d * w,
    d * d * w,
  ];
}

/** How far a point is from the planes of a quadric, squared and summed. */
function quadricError(q: ArrayLike<number>, x: number, y: number, z: number) {
  return (
    q[0]! * x * x +
    2 * q[1]! * x * y +
    2 * q[2]! * x * z +
    2 * q[3]! * x +
    q[4]! * y * y +
    2 * q[5]! * y * z +
    2 * q[6]! * y +
    q[7]! * z * z +
    2 * q[8]! * z +
    q[9]!
  );
}

/** A small binary heap of [cost, a, b, stampA, stampB], cheapest first. */
class Heap {
  private items: [number, number, number, number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(item: [number, number, number, number, number]) {
    const h = this.items;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p]![0] <= h[i]![0]) break;
      [h[p], h[i]] = [h[i]!, h[p]!];
      i = p;
    }
  }
  pop() {
    const h = this.items;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l]![0] < h[m]![0]) m = l;
        if (r < h.length && h[r]![0] < h[m]![0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i]!, h[m]!];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Cuts a mesh down to about `targetTriangles` triangles by collapsing edges, cheapest first (quadric error metrics:
 * the cost of an edge is how far the new point would drift from the planes of the faces it replaces). The shape is kept
 * as well as the count allows: flat areas lose triangles first. Rules that keep the surface sound:
 *  - points on an open border (and so every hard edge of a shape built from separate faces, such as a cube) never move,
 *  - an edge is collapsed only if the surface stays a proper surface (no pinched or doubled faces),
 *  - a collapse that would fold a neighbouring face over is refused.
 * The result has only points and triangles: a UV map, creases and seams are dropped (the caller says so). It may stop
 * above the target when no safe collapse is left. Refuses a mesh already at or under the target.
 */
export function simplifyMesh(
  mesh: EditMesh,
  targetTriangles: number,
): SimplifyResult {
  const triangleCount = mesh.indices.length / 3;
  const target = Math.max(
    MIN_SIMPLIFIED_TRIANGLES,
    Math.floor(targetTriangles),
  );
  if (triangleCount <= target) {
    return {
      ok: false,
      reason: `The mesh has ${triangleCount} triangles already, which is not more than ${target}.`,
    };
  }
  const pointCount = mesh.positions.length / 3;
  const pos = new Float64Array(mesh.positions);
  const tri = Uint32Array.from(mesh.indices);
  const alive = new Uint8Array(triangleCount).fill(1);
  const around: Set<number>[] = Array.from(
    { length: pointCount },
    () => new Set(),
  );
  for (let t = 0; t < triangleCount; t++) {
    for (let k = 0; k < 3; k++) around[tri[t * 3 + k]!]!.add(t);
  }

  // Edges used by one triangle only are border edges; their points are pinned
  const edgeUse = new Map<number, number>();
  const edgeKey = (a: number, b: number) =>
    a < b ? a * pointCount + b : b * pointCount + a;
  for (let t = 0; t < triangleCount; t++) {
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(tri[t * 3 + k]!, tri[t * 3 + ((k + 1) % 3)]!);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  const pinned = new Uint8Array(pointCount);
  for (let t = 0; t < triangleCount; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k]!;
      const b = tri[t * 3 + ((k + 1) % 3)]!;
      if (edgeUse.get(edgeKey(a, b)) !== 2) pinned[a] = pinned[b] = 1;
    }
  }

  const normalOf = (t: number, at: (p: number) => V3): V3 => {
    const a = at(tri[t * 3]!);
    const b = at(tri[t * 3 + 1]!);
    const c = at(tri[t * 3 + 2]!);
    const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
  };
  const here = (p: number): V3 => [
    pos[p * 3]!,
    pos[p * 3 + 1]!,
    pos[p * 3 + 2]!,
  ];

  // One quadric per point: the sum of the planes of its faces, weighted by their area
  const quadric: number[][] = Array.from({ length: pointCount }, () =>
    new Array<number>(10).fill(0),
  );
  for (let t = 0; t < triangleCount; t++) {
    const n = normalOf(t, here);
    const twiceArea = Math.hypot(n[0], n[1], n[2]);
    if (twiceArea < 1e-20) continue;
    const [a, b, c] = [n[0] / twiceArea, n[1] / twiceArea, n[2] / twiceArea];
    const p = here(tri[t * 3]!);
    const q = planeQuadric(
      a,
      b,
      c,
      -(a * p[0] + b * p[1] + c * p[2]),
      twiceArea / 2,
    );
    for (let k = 0; k < 3; k++) {
      const target = quadric[tri[t * 3 + k]!]!;
      for (let i = 0; i < 10; i++) target[i]! += q[i]!;
    }
  }

  const stamp = new Uint32Array(pointCount);
  const heap = new Heap();
  const neighbours = (p: number) => {
    const out = new Set<number>();
    for (const t of around[p]!) {
      for (let k = 0; k < 3; k++) {
        const o = tri[t * 3 + k]!;
        if (o !== p) out.add(o);
      }
    }
    return out;
  };

  /** Where the merged point of edge a-b goes, and what it costs; null if the edge may not be collapsed. */
  const plan = (a: number, b: number): { cost: number; at: V3 } | null => {
    if (pinned[a] && pinned[b]) return null;
    const q = quadric[a]!.map((v, i) => v + quadric[b]![i]!);
    const options: V3[] = pinned[a]
      ? [here(a)]
      : pinned[b]
        ? [here(b)]
        : [
            here(a),
            here(b),
            [
              (pos[a * 3]! + pos[b * 3]!) / 2,
              (pos[a * 3 + 1]! + pos[b * 3 + 1]!) / 2,
              (pos[a * 3 + 2]! + pos[b * 3 + 2]!) / 2,
            ],
          ];
    let best: { cost: number; at: V3 } | null = null;
    for (const at of options) {
      const cost = quadricError(q, at[0], at[1], at[2]);
      if (!best || cost < best.cost) best = { cost, at };
    }
    return best;
  };
  const queue = (a: number, b: number) => {
    const p = plan(a, b);
    if (p) heap.push([Math.max(0, p.cost), a, b, stamp[a]!, stamp[b]!]);
  };
  for (const key of edgeUse.keys()) {
    queue(Math.floor(key / pointCount), key % pointCount);
  }

  /** The link condition and the fold test: may a and b merge into `at` without breaking the surface? */
  const safe = (a: number, b: number, at: V3): boolean => {
    const shared = [...around[a]!].filter((t) => around[b]!.has(t));
    if (shared.length !== 2) return false;
    // Only the two opposite points may be neighbours of both ends
    const opposite = new Set<number>();
    for (const t of shared) {
      for (let k = 0; k < 3; k++) {
        const p = tri[t * 3 + k]!;
        if (p !== a && p !== b) opposite.add(p);
      }
    }
    const nb = neighbours(b);
    for (const p of neighbours(a))
      if (nb.has(p) && !opposite.has(p)) return false;
    // No surviving neighbour face may turn over or collapse
    for (const end of [a, b]) {
      for (const t of around[end]!) {
        if (shared.includes(t)) continue;
        const before = normalOf(t, here);
        const after = normalOf(t, (p) => (p === a || p === b ? at : here(p)));
        const lb = Math.hypot(...before);
        const la = Math.hypot(...after);
        if (la < 1e-12 || lb < 1e-12) return false;
        const dot =
          (before[0] * after[0] + before[1] * after[1] + before[2] * after[2]) /
          (lb * la);
        if (dot < MIN_NORMAL_DOT) return false;
      }
    }
    return true;
  };

  let remaining = triangleCount;
  while (remaining > target && heap.size > 0) {
    const [, first, second, sa, sb] = heap.pop();
    if (stamp[first] !== sa || stamp[second] !== sb) continue; // an older version of this edge
    // The point that stays is the pinned one, so a point on a border keeps its place (and stays pinned)
    const [a, b] =
      pinned[second] && !pinned[first] ? [second, first] : [first, second];
    if (!around[a]!.size || !around[b]!.size) continue;
    const p = plan(a, b);
    if (!p || !safe(a, b, p.at)) continue;
    // Collapse b into a
    for (const t of [...around[a]!].filter((t) => around[b]!.has(t))) {
      alive[t] = 0;
      for (let k = 0; k < 3; k++) around[tri[t * 3 + k]!]!.delete(t);
      remaining--;
    }
    for (const t of around[b]!) {
      for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === b) tri[t * 3 + k] = a;
      around[a]!.add(t);
    }
    around[b]!.clear();
    pos[a * 3] = p.at[0];
    pos[a * 3 + 1] = p.at[1];
    pos[a * 3 + 2] = p.at[2];
    quadric[a] = quadric[a]!.map((v, i) => v + quadric[b]![i]!);
    stamp[a]!++;
    stamp[b]!++;
    for (const n of neighbours(a)) queue(a, n);
  }

  // Compact: keep the points still used and the triangles still alive
  const newIndex = new Int32Array(pointCount).fill(-1);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let t = 0; t < triangleCount; t++) {
    if (!alive[t]) continue;
    for (let k = 0; k < 3; k++) {
      const p = tri[t * 3 + k]!;
      if (newIndex[p] < 0) {
        newIndex[p] = positions.length / 3;
        positions.push(pos[p * 3]!, pos[p * 3 + 1]!, pos[p * 3 + 2]!);
      }
      indices.push(newIndex[p]!);
    }
  }
  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
    },
    triangles: indices.length / 3,
  };
}
