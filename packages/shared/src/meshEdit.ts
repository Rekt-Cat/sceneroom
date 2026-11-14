import type { ShapeMesh } from "./modifiers";
import type { Rect } from "./screenRect";
import type { Vec3 } from "./index";

/**
 * The maths of editing the points of a mesh, with no three.js in it so it can be tested. Points are
 * numbered in the order they are stored; a selection is a list of those numbers.
 */

/**
 * Every edge of a mesh once, as pairs of point numbers (a, b, a, b, ...). An edge shared by two
 * triangles is listed once. Points are compared by number, so a mesh whose neighbouring triangles do not
 * share points (like a cube, which has separate corners for each face) lists such an edge twice, once
 * from each side; that draws on top of itself and looks the same.
 */
export function meshEdges(indices: Uint32Array): Uint32Array {
  const seen = new Set<number>();
  const pairs: number[] = [];
  const point = (corner: number) => indices[corner]!;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    for (const [a, b] of [
      [point(t), point(t + 1)],
      [point(t + 1), point(t + 2)],
      [point(t + 2), point(t)],
    ] as const) {
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      // The two numbers packed into one: points are well below 2^26 (the mesh limit is a million)
      const key = low * 67_108_864 + high;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(low, high);
    }
  }
  return Uint32Array.from(pairs);
}

/**
 * The point nearest to a spot on the screen, or -1 if none is within `maxDistance` pixels. `projected` has
 * the screen position of every point (x, y, x, y, ...); a point that cannot be shown (behind the camera)
 * has NaN there and is never chosen. When two are equally near, the lower number wins.
 */
export function nearestPoint(
  projected: Float32Array,
  x: number,
  y: number,
  maxDistance: number,
): number {
  let best = -1;
  let bestDistance = maxDistance;
  for (let i = 0; i * 2 + 1 < projected.length; i++) {
    const dx = projected[i * 2]! - x;
    const dy = projected[i * 2 + 1]! - y;
    const distance = Math.hypot(dx, dy);
    // NaN compares as false, so a point that cannot be shown is skipped
    if (distance <= bestDistance) {
      if (best === -1 || distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** The numbers of the points whose screen position is inside the rectangle (edges included). */
export function pointsInRect(projected: Float32Array, rect: Rect): number[] {
  const inside: number[] = [];
  for (let i = 0; i * 2 + 1 < projected.length; i++) {
    const x = projected[i * 2]!;
    const y = projected[i * 2 + 1]!;
    if (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    ) {
      inside.push(i);
    }
  }
  return inside;
}

/**
 * What the selection becomes after a click on a point (`hit`, or -1 for empty space):
 * - a plain click on a point selects only it; on empty space it clears the selection
 * - with Shift (additive) a click on a point adds it, or takes it out if it was selected; on empty
 *   space it changes nothing
 */
export function selectionAfterClick(
  current: readonly number[],
  hit: number,
  additive: boolean,
): number[] {
  if (hit < 0) return additive ? [...current] : [];
  if (!additive) return [hit];
  return current.includes(hit)
    ? current.filter((point) => point !== hit)
    : [...current, hit];
}

/** The selection after a box: the points inside it, added to the current selection (additive) or replacing it. No repeats. */
export function selectionAfterBox(
  current: readonly number[],
  inside: readonly number[],
  additive: boolean,
): number[] {
  return [...new Set(additive ? [...current, ...inside] : inside)];
}

/** The middle of the selected points (their average), or null if nothing is selected. */
export function selectionCentroid(
  positions: Float32Array,
  selected: readonly number[],
): Vec3 | null {
  if (selected.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of selected) {
    x += positions[point * 3]!;
    y += positions[point * 3 + 1]!;
    z += positions[point * 3 + 2]!;
  }
  const n = selected.length;
  return [x / n, y / n, z / n];
}

/**
 * Writes into `target` the points of `start`, with the selected ones moved by `delta`. Always measured
 * from `start` (the points as they were when the drag began), so dragging back and forth never adds up
 * rounding. `target` may be `start` itself only if nothing else reads it. Returns `target`.
 */
export function translateSelected(
  start: Float32Array,
  selected: readonly number[],
  delta: Vec3,
  target: Float32Array = new Float32Array(start),
): Float32Array {
  if (target !== start) target.set(start);
  for (const point of selected) {
    target[point * 3] = start[point * 3]! + delta[0];
    target[point * 3 + 1] = start[point * 3 + 1]! + delta[1];
    target[point * 3 + 2] = start[point * 3 + 2]! + delta[2];
  }
  return target;
}

/** The numbers 0, 1, 2 ... count - 1: every point of a mesh (for "select all"). */
export function allPoints(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

// ---- Points that sit on the same spot ----

/** The points of a mesh grouped by where they are: points on the same spot (within `tolerance`) are one group. */
export type WeldGroups = {
  /** The group of every point (points in the same group sit on the same spot). */
  ids: Uint32Array;
  /** The points of each group, by group number. */
  members: number[][];
};

/**
 * Finds which points sit on the same spot. A cube has three separate points at each corner (one for each
 * face, so the faces can have sharp edges), and the seam of a cylinder has two: they are one place to the
 * eye, and must be selected and moved together, or a gap opens in the surface. Points are compared on a
 * grid of size `tolerance`; points made by copying (as three.js does) are bit-for-bit equal, so they always
 * land in the same cell.
 */
export function weldGroups(
  positions: Float32Array,
  tolerance = 1e-4,
): WeldGroups {
  const count = positions.length / 3;
  const ids = new Uint32Array(count);
  const members: number[][] = [];
  const cells = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    // The three grid numbers as text: exact, and simple (a mesh has at most a million points)
    const key = `${Math.round(positions[i * 3]! / tolerance)},${Math.round(positions[i * 3 + 1]! / tolerance)},${Math.round(positions[i * 3 + 2]! / tolerance)}`;
    let group = cells.get(key);
    if (group === undefined) {
      group = members.length;
      members.push([]);
      cells.set(key, group);
    }
    ids[i] = group;
    members[group]!.push(i);
  }
  return { ids, members };
}

/** All the points that share a spot with any of the given points (the given ones included), without repeats. */
export function expandToWelded(
  groups: WeldGroups,
  points: readonly number[],
): number[] {
  const result = new Set<number>();
  for (const point of points) {
    const group = groups.ids[point];
    if (group === undefined) continue;
    for (const member of groups.members[group]!) result.add(member);
  }
  return [...result];
}

/**
 * What the selection becomes after a click on a point, treating all the points on the same spot as one:
 * a plain click selects that spot; with Shift it is added, or taken out if all of it was selected; a click
 * on empty space (`hit` -1) clears the selection (and changes nothing with Shift).
 */
export function selectionAfterWeldedClick(
  groups: WeldGroups,
  current: readonly number[],
  hit: number,
  additive: boolean,
): number[] {
  if (hit < 0) return additive ? [...current] : [];
  const spot = expandToWelded(groups, [hit]);
  if (!additive) return spot;
  const selected = new Set(current);
  return spot.every((point) => selected.has(point))
    ? current.filter((point) => !spot.includes(point))
    : [...new Set([...current, ...spot])];
}

// ---- Turning and scaling points ----

/**
 * Writes into `target` the points of `start`, with the selected ones moved by a 4x4 matrix (16 numbers,
 * column by column, as three.js stores them). Used for turning and scaling the selected points around a
 * pivot: the matrix already holds the pivot (move to the pivot, turn or scale, move back). Measured from
 * `start`, like `translateSelected`.
 */
export function transformSelected(
  start: Float32Array,
  selected: readonly number[],
  matrix: ArrayLike<number>,
  target: Float32Array = new Float32Array(start),
): Float32Array {
  if (target !== start) target.set(start);
  const m = matrix;
  for (const point of selected) {
    const x = start[point * 3]!;
    const y = start[point * 3 + 1]!;
    const z = start[point * 3 + 2]!;
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    const divide = w === 0 ? 1 : w;
    target[point * 3] = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / divide;
    target[point * 3 + 1] =
      (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / divide;
    target[point * 3 + 2] =
      (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / divide;
  }
  return target;
}

// ---- Changing the shape of the mesh itself ----

/** A mesh as the edit operations see it: its points and triangles. */
export type EditMesh = ShapeMesh;

export type EditResult =
  | { ok: true; mesh: EditMesh; selected: number[] }
  | { ok: false; reason: string };

/**
 * Deletes the selected points and every triangle that uses one of them, then drops the points nothing
 * uses any more and renumbers the rest. Returns the new mesh and an empty selection. Refuses when
 * nothing is selected or when nothing would be left of the mesh.
 */
export function deletePoints(
  mesh: EditMesh,
  selected: readonly number[],
): EditResult {
  if (selected.length === 0) {
    return { ok: false, reason: "Select some points first." };
  }
  const doomed = new Set(selected);
  const kept: number[] = [];
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const a = mesh.indices[t]!;
    const b = mesh.indices[t + 1]!;
    const c = mesh.indices[t + 2]!;
    if (!doomed.has(a) && !doomed.has(b) && !doomed.has(c)) kept.push(a, b, c);
  }
  if (kept.length === 0) {
    return {
      ok: false,
      reason: "That would delete the whole mesh. Select fewer points.",
    };
  }
  // Renumber: only the points the remaining triangles use stay
  const renumber = new Map<number, number>();
  const positions: number[] = [];
  const indices = kept.map((old) => {
    let next = renumber.get(old);
    if (next === undefined) {
      next = renumber.size;
      renumber.set(old, next);
      positions.push(
        mesh.positions[old * 3]!,
        mesh.positions[old * 3 + 1]!,
        mesh.positions[old * 3 + 2]!,
      );
    }
    return next;
  });
  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
    },
    selected: [],
  };
}

/** The triangles (by their first corner's place in the list divided by 3) whose three points are all selected. */
export function selectedFaces(
  mesh: EditMesh,
  selected: readonly number[],
): number[] {
  const chosen = new Set(selected);
  const faces: number[] = [];
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    if (
      chosen.has(mesh.indices[t]!) &&
      chosen.has(mesh.indices[t + 1]!) &&
      chosen.has(mesh.indices[t + 2]!)
    ) {
      faces.push(t / 3);
    }
  }
  return faces;
}

/** The average direction the selected faces point (their normals, longer for bigger faces), as a unit vector, or null if they cancel out. */
export function faceDirection(
  mesh: EditMesh,
  faces: readonly number[],
): Vec3 | null {
  let x = 0;
  let y = 0;
  let z = 0;
  const p = mesh.positions;
  for (const face of faces) {
    const a = mesh.indices[face * 3]! * 3;
    const b = mesh.indices[face * 3 + 1]! * 3;
    const c = mesh.indices[face * 3 + 2]! * 3;
    const ux = p[b]! - p[a]!;
    const uy = p[b + 1]! - p[a + 1]!;
    const uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!;
    const vy = p[c + 1]! - p[a + 1]!;
    const vz = p[c + 2]! - p[a + 2]!;
    // The cross product: its direction is the face's, its length twice the face's area
    x += uy * vz - uz * vy;
    y += uz * vx - ux * vz;
    z += ux * vy - uy * vx;
  }
  const length = Math.hypot(x, y, z);
  return length < 1e-12 ? null : [x / length, y / length, z / length];
}

/**
 * Extrudes the selected faces: the faces are copied and pushed `distance` along their average direction,
 * and a wall joins the old edge of the group of faces to the new one. A face is a triangle whose three points
 * are all selected, so select all the points of a face (or a group of faces) first. The walls get their own
 * points so they have sharp edges. Points on the same spot count as one when finding the edge of the group.
 * Returns the new mesh and the selection: the points of the new cap, ready to be moved further.
 */
export function extrudeFaces(
  mesh: EditMesh,
  selected: readonly number[],
  distance: number,
  groups: WeldGroups,
): EditResult {
  const faces = selectedFaces(mesh, selected);
  if (faces.length === 0) {
    return {
      ok: false,
      reason:
        "Select all the points of at least one face first (a Ctrl-drag box around it does it).",
    };
  }
  const direction = faceDirection(mesh, faces) ?? [0, 1, 0];
  const push: Vec3 = [
    direction[0] * distance,
    direction[1] * distance,
    direction[2] * distance,
  ];

  const positions: number[] = Array.from(mesh.positions);
  const indices: number[] = [];

  // The faces that are not extruded stay as they are
  const inRegion = new Set(faces);
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    if (inRegion.has(t)) continue;
    indices.push(
      mesh.indices[t * 3]!,
      mesh.indices[t * 3 + 1]!,
      mesh.indices[t * 3 + 2]!,
    );
  }

  // The cap: a copy of every point the faces use, pushed out; the faces now use the copies
  const copyOf = new Map<number, number>();
  const capPoints: number[] = [];
  const copy = (point: number) => {
    let made = copyOf.get(point);
    if (made === undefined) {
      made = positions.length / 3;
      copyOf.set(point, made);
      capPoints.push(made);
      positions.push(
        mesh.positions[point * 3]! + push[0],
        mesh.positions[point * 3 + 1]! + push[1],
        mesh.positions[point * 3 + 2]! + push[2],
      );
    }
    return made;
  };
  for (const face of faces) {
    for (let k = 0; k < 3; k++) copy(mesh.indices[face * 3 + k]!);
  }
  for (const face of faces) {
    indices.push(
      copy(mesh.indices[face * 3]!),
      copy(mesh.indices[face * 3 + 1]!),
      copy(mesh.indices[face * 3 + 2]!),
    );
  }

  // The edge of the group: an edge (by spot, not by point number) that only one of the faces uses
  const uses = new Map<string, number>();
  const edgeKey = (a: number, b: number) => {
    const ga = groups.ids[a]!;
    const gb = groups.ids[b]!;
    return ga < gb ? `${ga}-${gb}` : `${gb}-${ga}`;
  };
  for (const face of faces) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[face * 3 + k]!;
      const b = mesh.indices[face * 3 + ((k + 1) % 3)]!;
      uses.set(edgeKey(a, b), (uses.get(edgeKey(a, b)) ?? 0) + 1);
    }
  }
  // A wall on each edge of the group, with its own four points, facing outwards from the group
  const wallPoint = (source: number, pushed: boolean) => {
    const id = positions.length / 3;
    positions.push(
      mesh.positions[source * 3]! + (pushed ? push[0] : 0),
      mesh.positions[source * 3 + 1]! + (pushed ? push[1] : 0),
      mesh.positions[source * 3 + 2]! + (pushed ? push[2] : 0),
    );
    return id;
  };
  for (const face of faces) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[face * 3 + k]!;
      const b = mesh.indices[face * 3 + ((k + 1) % 3)]!;
      if (uses.get(edgeKey(a, b)) !== 1) continue;
      const a0 = wallPoint(a, false);
      const b0 = wallPoint(b, false);
      const b1 = wallPoint(b, true);
      const a1 = wallPoint(a, true);
      // Two triangles per wall, wound so the wall faces away from the group (see the notes in the tests)
      indices.push(a0, b0, b1, a0, b1, a1);
    }
  }

  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
    },
    selected: capPoints,
  };
}

/** How far a new extrusion pushes out, as a fraction of the size of what is being extruded. */
export const EXTRUDE_FRACTION = 0.25;

/**
 * The distance an extrusion starts with: a quarter of the biggest side of the box around the selected
 * points (so a big face is pushed out further than a small one). When the selected points have no size (a
 * single point or a straight line), a quarter of the size of the whole mesh is used instead; 0.25 for an
 * empty one.
 */
export function extrudeDistance(
  mesh: EditMesh,
  selected: readonly number[],
): number {
  const size = (points: readonly number[] | null): number => {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const each = (i: number) => {
      for (let k = 0; k < 3; k++) {
        const value = mesh.positions[i * 3 + k]!;
        if (value < min[k]!) min[k] = value;
        if (value > max[k]!) max[k] = value;
      }
    };
    if (points) points.forEach(each);
    else for (let i = 0; i < mesh.positions.length / 3; i++) each(i);
    return Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
  };
  const chosen = size(selected);
  const whole = chosen > 1e-9 ? chosen : size(null);
  return whole > 1e-9 && Number.isFinite(whole)
    ? whole * EXTRUDE_FRACTION
    : 0.25;
}

// ---- Selecting a whole face ----

/** Triangles whose normals differ by less than this many degrees count as flat together (one "face"). */
export const FLAT_FACE_ANGLE_DEGREES = 1;

/**
 * The points of the flat face around a triangle: the triangle and every connected triangle that lies in
 * the same plane (its direction within `maxAngleDegrees`), found by walking across shared edges. Edges are
 * compared by spot, so triangles that do not share point numbers (the two halves of a cube's side, or
 * neighbours on a surface made with separate points) still join. A cube side gives its two triangles; a
 * subdivided plane gives all of it; a round surface gives just the triangle. Returns every point of those
 * triangles that sits on those spots, which is a selection ready for Extrude.
 */
export function flatFacePoints(
  mesh: EditMesh,
  startTriangle: number,
  groups: WeldGroups,
  maxAngleDegrees: number = FLAT_FACE_ANGLE_DEGREES,
): number[] {
  const triangles = mesh.indices.length / 3;
  if (startTriangle < 0 || startTriangle >= triangles) return [];

  const normal = (t: number): Vec3 | null => faceDirection(mesh, [t]);
  const edgeKey = (a: number, b: number) => {
    const ga = groups.ids[a]!;
    const gb = groups.ids[b]!;
    return ga < gb ? `${ga}-${gb}` : `${gb}-${ga}`;
  };
  // Which triangles use each edge (by spot)
  const edgeToTriangles = new Map<string, number[]>();
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(
        mesh.indices[t * 3 + k]!,
        mesh.indices[t * 3 + ((k + 1) % 3)]!,
      );
      const list = edgeToTriangles.get(key);
      if (list) list.push(t);
      else edgeToTriangles.set(key, [t]);
    }
  }

  const origin = normal(startTriangle);
  if (!origin) return [];
  const minDot = Math.cos((maxAngleDegrees * Math.PI) / 180);
  const inFace = new Set<number>([startTriangle]);
  const queue = [startTriangle];
  while (queue.length > 0) {
    const t = queue.pop()!;
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(
        mesh.indices[t * 3 + k]!,
        mesh.indices[t * 3 + ((k + 1) % 3)]!,
      );
      for (const next of edgeToTriangles.get(key) ?? []) {
        if (inFace.has(next)) continue;
        const n = normal(next);
        if (!n) continue;
        if (n[0] * origin[0] + n[1] * origin[1] + n[2] * origin[2] >= minDot) {
          inFace.add(next);
          queue.push(next);
        }
      }
    }
  }

  const points = new Set<number>();
  for (const t of inFace) {
    for (let k = 0; k < 3; k++) points.add(mesh.indices[t * 3 + k]!);
  }
  return [...points];
}
