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
