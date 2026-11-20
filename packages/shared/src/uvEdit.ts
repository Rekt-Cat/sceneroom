import type { EditMesh } from "./meshEdit";
import { DEFAULT_UV_MARGIN, packShelves, uvIslands } from "./unwrap";

/** What to do to the selected islands of a map. Rotation and scale turn and grow round the middle of the selection. */
export type UvTransform = {
  /** Slide by this much in the 0 to 1 square (u across, v up). */
  move?: [number, number];
  /** Turn by this many radians, counter-clockwise on the map. */
  rotate?: number;
  /** Multiply the size by this (above 0). */
  scale?: number;
  /** Mirror left to right. */
  flipU?: boolean;
  /** Mirror top to bottom. */
  flipV?: boolean;
};

/** The points that belong to the given islands, from the island of each triangle. */
function pointsOfIslands(
  mesh: EditMesh,
  island: Int32Array,
  chosen: ReadonlySet<number>,
): Set<number> {
  const points = new Set<number>();
  for (let t = 0; t < island.length; t++) {
    if (!chosen.has(island[t]!)) continue;
    for (let k = 0; k < 3; k++) points.add(mesh.indices[t * 3 + k]!);
  }
  return points;
}

/** The smallest box round some points of the map: [minU, minV, maxU, maxV]. */
function boundsOf(
  uvs: Float32Array,
  points: Iterable<number>,
): [number, number, number, number] {
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const p of points) {
    minU = Math.min(minU, uvs[p * 2]!);
    maxU = Math.max(maxU, uvs[p * 2]!);
    minV = Math.min(minV, uvs[p * 2 + 1]!);
    maxV = Math.max(maxV, uvs[p * 2 + 1]!);
  }
  return [minU, minV, maxU, maxV];
}

/**
 * The island under a spot of the map, or -1 if there is none. When islands overlap, the one drawn last (highest
 * triangle number) wins, which is the one drawn on top in the UV window.
 */
export function uvIslandAt(mesh: EditMesh, u: number, v: number): number {
  if (!mesh.uvs) return -1;
  const { island } = uvIslands(mesh);
  const uv = mesh.uvs;
  for (let t = island.length - 1; t >= 0; t--) {
    const [a, b, c] = [
      mesh.indices[t * 3]!,
      mesh.indices[t * 3 + 1]!,
      mesh.indices[t * 3 + 2]!,
    ];
    const d1 = side(u, v, uv, a, b);
    const d2 = side(u, v, uv, b, c);
    const d3 = side(u, v, uv, c, a);
    const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(hasNegative && hasPositive)) return island[t]!;
  }
  return -1;
}

/** Which side of the line from point a to point b the spot (u, v) is on (the sign of a cross product). */
function side(
  u: number,
  v: number,
  uv: Float32Array,
  a: number,
  b: number,
): number {
  return (
    (uv[b * 2]! - uv[a * 2]!) * (v - uv[a * 2 + 1]!) -
    (uv[b * 2 + 1]! - uv[a * 2 + 1]!) * (u - uv[a * 2]!)
  );
}

/**
 * Moves, turns, scales or mirrors the chosen islands of the map. Only the map changes: points, faces and seams stay.
 * Returns the mesh unchanged if it has no map or nothing is chosen. A scale of 0 or less is ignored.
 */
export function transformUvIslands(
  mesh: EditMesh,
  chosen: ReadonlySet<number>,
  change: UvTransform,
): EditMesh {
  if (!mesh.uvs || chosen.size === 0) return mesh;
  const { island } = uvIslands(mesh);
  const points = pointsOfIslands(mesh, island, chosen);
  if (points.size === 0) return mesh;
  const [minU, minV, maxU, maxV] = boundsOf(mesh.uvs, points);
  const centreU = (minU + maxU) / 2;
  const centreV = (minV + maxV) / 2;
  const angle = change.rotate ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const scale =
    change.scale !== undefined && change.scale > 0 ? change.scale : 1;
  const [moveU, moveV] = change.move ?? [0, 0];
  const uvs = new Float32Array(mesh.uvs);
  for (const p of points) {
    let u = uvs[p * 2]! - centreU;
    let v = uvs[p * 2 + 1]! - centreV;
    if (change.flipU) u = -u;
    if (change.flipV) v = -v;
    const turnedU = u * cos - v * sin;
    const turnedV = u * sin + v * cos;
    uvs[p * 2] = centreU + turnedU * scale + moveU;
    uvs[p * 2 + 1] = centreV + turnedV * scale + moveV;
  }
  return { ...mesh, uvs };
}

/**
 * Packs ALL islands again into the 0 to 1 square: every island keeps its shape and the sizes stay in proportion, but
 * all are scaled by one common factor (the biggest that fits) and placed in rows `margin` apart. Islands are not
 * turned. Returns null if the mesh has no map or the islands cannot fit.
 */
export function packUvIslands(
  mesh: EditMesh,
  margin: number = DEFAULT_UV_MARGIN,
): EditMesh | null {
  if (!mesh.uvs) return null;
  const { island, count } = uvIslands(mesh);
  if (count === 0) return null;
  const all = Array.from({ length: count }, (_, i) => i);
  const groups = all.map((i) => pointsOfIslands(mesh, island, new Set([i])));
  const boxes = groups.map((points) => boundsOf(mesh.uvs!, points));
  const sizes = boxes.map(([u0, v0, u1, v1]) => ({
    width: Math.max(u1 - u0, 1e-6),
    height: Math.max(v1 - v0, 1e-6),
  }));
  const place = (factor: number) =>
    packShelves(
      sizes.map((s) => ({
        width: s.width * factor,
        height: s.height * factor,
      })),
      margin,
    );
  // The biggest common scale that still fits, found by halving the search range
  let low = 0;
  let high = 1 / Math.min(...sizes.map((s) => Math.max(s.width, s.height)));
  high = Math.min(high, 1e4);
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (place(mid)) low = mid;
    else high = mid;
  }
  const placed = low > 0 ? place(low) : null;
  if (!placed) return null;
  const uvs = new Float32Array(mesh.uvs);
  groups.forEach((points, i) => {
    const [u0, v0] = boxes[i]!;
    for (const p of points) {
      uvs[p * 2] = placed[i]!.x + (mesh.uvs![p * 2]! - u0) * low;
      uvs[p * 2 + 1] = placed[i]!.y + (mesh.uvs![p * 2 + 1]! - v0) * low;
    }
  });
  return { ...mesh, uvs };
}
