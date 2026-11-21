/**
 * Ray casting against a triangle mesh, made fast with a BVH (bounding volume hierarchy): the triangles are grouped into
 * a tree of boxes, so a ray only tests the few triangles whose boxes it passes through. Used for baking, where every
 * pixel of a texture casts a ray.
 */

export type RayHit = {
  /** Distance along the ray (the direction is unit length, so this is a length). */
  t: number;
  /** Which triangle was hit. */
  triangle: number;
  /** Barycentric coordinates of the hit: the point is a + u * (b - a) + v * (c - a). */
  u: number;
  v: number;
};

export type RayMesh = {
  /** The nearest hit within `maxDistance`, or null. `direction` must have length 1. */
  raycast: (
    origin: readonly [number, number, number],
    direction: readonly [number, number, number],
    maxDistance: number,
  ) => RayHit | null;
  triangles: number;
};

/** Triangles in a leaf of the tree: few enough to test quickly, many enough to keep the tree small. */
const LEAF_SIZE = 4;

export function buildRayMesh(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
): RayMesh {
  const count = Math.floor(indices.length / 3);
  // Boxes and centres of the triangles
  const boxes = new Float32Array(count * 6);
  const centres = new Float32Array(count * 3);
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 3; k++) {
      const a = positions[indices[t * 3]! * 3 + k]!;
      const b = positions[indices[t * 3 + 1]! * 3 + k]!;
      const c = positions[indices[t * 3 + 2]! * 3 + k]!;
      boxes[t * 6 + k] = Math.min(a, b, c);
      boxes[t * 6 + 3 + k] = Math.max(a, b, c);
      centres[t * 3 + k] = (a + b + c) / 3;
    }
  }
  const order = Uint32Array.from({ length: count }, (_, i) => i);

  // Nodes: bounds (6 numbers), then either two children or a run of triangles in `order`
  const nodeBounds: number[] = [];
  const nodeLeft: number[] = []; // child index, or -1 for a leaf
  const nodeRight: number[] = [];
  const nodeStart: number[] = [];
  const nodeCount: number[] = [];

  function build(start: number, end: number): number {
    const node = nodeLeft.length;
    nodeLeft.push(-1);
    nodeRight.push(-1);
    nodeStart.push(start);
    nodeCount.push(end - start);
    const bounds = [
      Infinity,
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
      -Infinity,
    ];
    const centreBounds = [
      Infinity,
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
      -Infinity,
    ];
    for (let i = start; i < end; i++) {
      const t = order[i]!;
      for (let k = 0; k < 3; k++) {
        bounds[k] = Math.min(bounds[k]!, boxes[t * 6 + k]!);
        bounds[3 + k] = Math.max(bounds[3 + k]!, boxes[t * 6 + 3 + k]!);
        centreBounds[k] = Math.min(centreBounds[k]!, centres[t * 3 + k]!);
        centreBounds[3 + k] = Math.max(
          centreBounds[3 + k]!,
          centres[t * 3 + k]!,
        );
      }
    }
    nodeBounds.push(...bounds);
    if (end - start <= LEAF_SIZE) return node;
    // Split along the longest side of the centres, at the middle triangle
    let axis = 0;
    let longest = -1;
    for (let k = 0; k < 3; k++) {
      const length = centreBounds[3 + k]! - centreBounds[k]!;
      if (length > longest) {
        longest = length;
        axis = k;
      }
    }
    if (longest <= 0) return node; // all centres on one spot: keep as one leaf
    const slice = Array.from(order.subarray(start, end));
    slice.sort((x, y) => centres[x * 3 + axis]! - centres[y * 3 + axis]!);
    order.set(slice, start);
    const middle = (start + end) >> 1;
    const left = build(start, middle);
    const right = build(middle, end);
    nodeLeft[node] = left;
    nodeRight[node] = right;
    nodeCount[node] = 0;
    return node;
  }
  if (count > 0) build(0, count);

  const bounds = Float32Array.from(nodeBounds);
  const left = Int32Array.from(nodeLeft);
  const right = Int32Array.from(nodeRight);
  const start = Int32Array.from(nodeStart);
  const size = Int32Array.from(nodeCount);
  const stack = new Int32Array(128);

  function raycast(
    origin: readonly [number, number, number],
    dir: readonly [number, number, number],
    maxDistance: number,
  ): RayHit | null {
    if (count === 0) return null;
    const inv = [1 / dir[0], 1 / dir[1], 1 / dir[2]] as const;
    let best: RayHit | null = null;
    let nearest = maxDistance;
    let top = 0;
    stack[top++] = 0;
    while (top > 0) {
      const node = stack[--top]!;
      // Slab test: where the ray is inside the box along each axis
      let tMin = 0;
      let tMax = nearest;
      for (let k = 0; k < 3; k++) {
        let t0 = (bounds[node * 6 + k]! - origin[k]) * inv[k];
        let t1 = (bounds[node * 6 + 3 + k]! - origin[k]) * inv[k];
        if (t0 > t1) [t0, t1] = [t1, t0];
        // A ray parallel to a slab gives NaN or infinity: inside the slab or not at all
        if (Number.isNaN(t0) || Number.isNaN(t1)) {
          if (
            origin[k] < bounds[node * 6 + k]! ||
            origin[k] > bounds[node * 6 + 3 + k]!
          ) {
            tMin = Infinity;
          }
          continue;
        }
        tMin = Math.max(tMin, t0);
        tMax = Math.min(tMax, t1);
      }
      if (tMin > tMax) continue;
      if (left[node]! < 0) {
        for (let i = start[node]!; i < start[node]! + size[node]!; i++) {
          const triangle = order[i]!;
          const hit = hitTriangle(positions, indices, triangle, origin, dir);
          if (hit && hit.t < nearest) {
            nearest = hit.t;
            best = { t: hit.t, triangle, u: hit.u, v: hit.v };
          }
        }
      } else {
        stack[top++] = left[node]!;
        stack[top++] = right[node]!;
      }
    }
    return best;
  }

  return { raycast, triangles: count };
}

/** Moller-Trumbore: where the ray meets one triangle in front of it. */
function hitTriangle(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  triangle: number,
  o: readonly [number, number, number],
  d: readonly [number, number, number],
): { t: number; u: number; v: number } | null {
  const ia = indices[triangle * 3]! * 3;
  const ib = indices[triangle * 3 + 1]! * 3;
  const ic = indices[triangle * 3 + 2]! * 3;
  const ax = positions[ia]!;
  const ay = positions[ia + 1]!;
  const az = positions[ia + 2]!;
  const e1x = positions[ib]! - ax;
  const e1y = positions[ib + 1]! - ay;
  const e1z = positions[ib + 2]! - az;
  const e2x = positions[ic]! - ax;
  const e2y = positions[ic + 1]! - ay;
  const e2z = positions[ic + 2]! - az;
  const hx = d[1] * e2z - d[2] * e2y;
  const hy = d[2] * e2x - d[0] * e2z;
  const hz = d[0] * e2y - d[1] * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-14) return null;
  const f = 1 / det;
  const sx = o[0] - ax;
  const sy = o[1] - ay;
  const sz = o[2] - az;
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return null;
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
  if (v < 0 || u + v > 1) return null;
  const t = f * (e2x * qx + e2y * qy + e2z * qz);
  return t > 1e-9 ? { t, u, v } : null;
}
