import { remapCreases } from "./creases";
import { weldGroups, type EditMesh } from "./meshEdit";
import { remapSeams, seamsOf } from "./seams";

/** Faces whose directions differ from the chart's average by less than this many degrees go into the same chart. */
export const DEFAULT_CHART_ANGLE_DEGREES = 66;
/** The empty strip left between charts and round the edge of the 0 to 1 square (a share of its side). */
export const DEFAULT_UV_MARGIN = 0.02;

type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec): Vec => {
  const l = length(a);
  return l < 1e-12 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
};

export type UnwrapOptions = {
  angleLimitDegrees?: number;
  margin?: number;
};

export type UnwrapResult =
  | {
      ok: true;
      /** The mesh with a UV map. Points shared by two charts are split in two (same place, different UV). */
      mesh: EditMesh;
      /** How many separate pieces ("islands") the surface was cut into. */
      islands: number;
    }
  | { ok: false; reason: string };

/** A rectangle to place: its size and, once placed, where its lower-left corner is. */
export type PackRect = { width: number; height: number };
export type Placed = { x: number; y: number };

/**
 * Places rectangles into the 0 to 1 square with `gap` between them and round the edge, in rows ("shelves"): tall
 * ones first, each row as high as its tallest. Returns where each goes (in the order given), or null if they do not fit.
 */
export function packShelves(
  rects: readonly PackRect[],
  gap: number,
): Placed[] | null {
  const order = rects
    .map((_, i) => i)
    .sort((a, b) => rects[b]!.height - rects[a]!.height || a - b);
  const placed: Placed[] = new Array<Placed>(rects.length);
  let x = gap;
  let y = gap;
  let rowHeight = 0;
  for (const i of order) {
    const { width, height } = rects[i]!;
    if (width > 1 - 2 * gap || height > 1 - 2 * gap) return null;
    if (x + width > 1 - gap) {
      // A new row
      x = gap;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    if (y + height > 1 - gap) return null;
    placed[i] = { x, y };
    x += width + gap;
    rowHeight = Math.max(rowHeight, height);
  }
  return placed;
}

/**
 * Gives a mesh a UV map in one step ("Unwrap"), with no seams needed:
 *  1. The faces are grouped into CHARTS: neighbouring faces join a chart while they point about the same way
 *     (within `angleLimitDegrees` of the chart's average direction). Marked seams are never crossed.
 *  2. Each chart is projected flat along its average direction (like a shadow on a wall), in real size.
 *  3. The flat pieces are turned so the long side lies across, scaled by one common factor (so the texture is
 *     equally sharp everywhere) and packed into the 0 to 1 square, `margin` apart.
 * A point used by faces of two charts is split in two, because a point has a single UV. Needs no seams; the
 * result is a little distorted on curved surfaces (the careful method along seams comes later).
 */
export function smartUnwrap(
  mesh: EditMesh,
  options: UnwrapOptions = {},
): UnwrapResult {
  const angle = options.angleLimitDegrees ?? DEFAULT_CHART_ANGLE_DEGREES;
  const margin = Math.min(
    0.2,
    Math.max(0, options.margin ?? DEFAULT_UV_MARGIN),
  );
  const triangleCount = mesh.indices.length / 3;
  if (triangleCount === 0) {
    return { ok: false, reason: "There are no faces to unwrap." };
  }
  const p = (i: number): Vec => [
    mesh.positions[i * 3]!,
    mesh.positions[i * 3 + 1]!,
    mesh.positions[i * 3 + 2]!,
  ];
  const groups = weldGroups(mesh.positions);

  // Direction (unit) and area of every triangle
  const normals: Vec[] = [];
  const areas: number[] = [];
  for (let t = 0; t < triangleCount; t++) {
    const a = p(mesh.indices[t * 3]!);
    const b = p(mesh.indices[t * 3 + 1]!);
    const c = p(mesh.indices[t * 3 + 2]!);
    const n = cross(sub(b, a), sub(c, a));
    areas.push(length(n) / 2);
    normals.push(unit(n));
  }

  // Which triangles touch across an edge (by spot, so separate points on one spot still join), except at seams
  const seamEdges = new Set<string>();
  const edgeKey = (a: number, b: number) =>
    groups.ids[a]! < groups.ids[b]!
      ? `${groups.ids[a]!}-${groups.ids[b]!}`
      : `${groups.ids[b]!}-${groups.ids[a]!}`;
  for (const seam of mesh.seams ?? []) {
    if (seam.a < groups.ids.length && seam.b < groups.ids.length) {
      seamEdges.add(edgeKey(seam.a, seam.b));
    }
  }
  const onEdge = new Map<string, number[]>();
  for (let t = 0; t < triangleCount; t++) {
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(
        mesh.indices[t * 3 + k]!,
        mesh.indices[t * 3 + ((k + 1) % 3)]!,
      );
      const list = onEdge.get(key);
      if (list) list.push(t);
      else onEdge.set(key, [t]);
    }
  }
  const neighbours = (t: number): number[] => {
    const found: number[] = [];
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(
        mesh.indices[t * 3 + k]!,
        mesh.indices[t * 3 + ((k + 1) % 3)]!,
      );
      if (seamEdges.has(key)) continue;
      for (const other of onEdge.get(key) ?? [])
        if (other !== t) found.push(other);
    }
    return found;
  };

  // Charts: grow from the biggest faces first, adding neighbours that point about the same way
  const limit = Math.cos((angle * Math.PI) / 180);
  const chartOf = new Int32Array(triangleCount).fill(-1);
  const charts: number[][] = [];
  const direction: Vec[] = [];
  const bySize = Array.from({ length: triangleCount }, (_, t) => t).sort(
    (a, b) => areas[b]! - areas[a]! || a - b,
  );
  for (const seed of bySize) {
    if (chartOf[seed] !== -1) continue;
    const id = charts.length;
    const members = [seed];
    chartOf[seed] = id;
    let sum: Vec = [
      normals[seed]![0] * areas[seed]!,
      normals[seed]![1] * areas[seed]!,
      normals[seed]![2] * areas[seed]!,
    ];
    const queue = [seed];
    while (queue.length > 0) {
      const t = queue.shift()!;
      for (const other of neighbours(t)) {
        if (chartOf[other] !== -1) continue;
        // A face with no area has no direction: it simply joins the chart next to it
        const fits =
          areas[other]! < 1e-12 || dot(normals[other]!, unit(sum)) >= limit;
        if (!fits) continue;
        chartOf[other] = id;
        members.push(other);
        queue.push(other);
        sum = [
          sum[0] + normals[other]![0] * areas[other]!,
          sum[1] + normals[other]![1] * areas[other]!,
          sum[2] + normals[other]![2] * areas[other]!,
        ];
      }
    }
    charts.push(members);
    direction.push(unit(sum));
  }

  // Project every chart flat along its direction; (u, v) right-handed, so a face keeps its winding
  type Flat = {
    u: Map<number, [number, number]>;
    width: number;
    height: number;
  };
  const flats: Flat[] = charts.map((members, id) => {
    const n = direction[id]!;
    const least: Vec =
      Math.abs(n[0]) <= Math.abs(n[1]) && Math.abs(n[0]) <= Math.abs(n[2])
        ? [1, 0, 0]
        : Math.abs(n[1]) <= Math.abs(n[2])
          ? [0, 1, 0]
          : [0, 0, 1];
    const tangent = unit(cross(n, least));
    const bitangent = cross(n, tangent);
    const map = new Map<number, [number, number]>();
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    for (const t of members) {
      for (let k = 0; k < 3; k++) {
        const point = mesh.indices[t * 3 + k]!;
        if (map.has(point)) continue;
        const at = p(point);
        const uv: [number, number] = [dot(at, tangent), dot(at, bitangent)];
        map.set(point, uv);
        minU = Math.min(minU, uv[0]);
        maxU = Math.max(maxU, uv[0]);
        minV = Math.min(minV, uv[1]);
        maxV = Math.max(maxV, uv[1]);
      }
    }
    let width = maxU - minU;
    let height = maxV - minV;
    // Turn it a quarter so the long side lies across (a rotation, so faces keep their winding)
    const turn = height > width;
    for (const [point, uv] of map) {
      const u = uv[0] - minU;
      const v = uv[1] - minV;
      map.set(point, turn ? [height - v, u] : [u, v]);
    }
    if (turn) [width, height] = [height, width];
    return { u: map, width, height };
  });

  // One scale for all charts: the biggest that still packs into the square
  const tiny = 1e-9;
  const sizes = flats.map((f) => ({
    width: Math.max(f.width, tiny),
    height: Math.max(f.height, tiny),
  }));
  const fits = (scale: number) =>
    packShelves(
      sizes.map((s) => ({ width: s.width * scale, height: s.height * scale })),
      margin,
    );
  const largest = Math.max(...sizes.map((s) => Math.max(s.width, s.height)));
  let low = 0;
  let high = (1 - 2 * margin) / largest;
  if (fits(high)) low = high;
  else {
    for (let i = 0; i < 40; i++) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
  }
  const scale = low;
  const placed = fits(scale);
  if (!placed || !(scale > 0)) {
    return { ok: false, reason: "The faces could not be packed into the map." };
  }

  // The new points: one per (old point, chart)
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = new Array<number>(mesh.indices.length);
  const made = new Map<string, number>();
  const first = new Int32Array(mesh.positions.length / 3).fill(-1);
  for (let t = 0; t < triangleCount; t++) {
    const chart = chartOf[t]!;
    for (let k = 0; k < 3; k++) {
      const point = mesh.indices[t * 3 + k]!;
      const key = `${point}:${chart}`;
      let id = made.get(key);
      if (id === undefined) {
        id = positions.length / 3;
        made.set(key, id);
        positions.push(...p(point));
        const uv = flats[chart]!.u.get(point)!;
        uvs.push(
          placed[chart]!.x + uv[0] * scale,
          placed[chart]!.y + uv[1] * scale,
        );
        if (first[point] === -1) first[point] = id;
      }
      indices[t * 3 + k] = id;
    }
  }
  // Creases and seams follow their points (points no face uses have gone)
  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
      creases: remapCreases(mesh.creases, first),
      ...seamsOf(remapSeams(mesh.seams, first)),
      uvs: Float32Array.from(uvs),
    },
    islands: charts.length,
  };
}

/**
 * The island of every triangle of a mesh with UVs: triangles that share a point belong to one island (the points
 * are split where the map is cut). Numbered from 0 in the order the triangles come. Returns the numbers and how many
 * islands there are.
 */
export function uvIslands(mesh: EditMesh): {
  island: Int32Array;
  count: number;
} {
  const triangles = mesh.indices.length / 3;
  const parent = new Int32Array(triangles).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const owner = new Map<number, number>();
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const point = mesh.indices[t * 3 + k]!;
      const other = owner.get(point);
      if (other === undefined) owner.set(point, t);
      else parent[find(t)] = find(other);
    }
  }
  const number = new Map<number, number>();
  const island = new Int32Array(triangles);
  for (let t = 0; t < triangles; t++) {
    const root = find(t);
    if (!number.has(root)) number.set(root, number.size);
    island[t] = number.get(root)!;
  }
  return { island, count: number.size };
}
