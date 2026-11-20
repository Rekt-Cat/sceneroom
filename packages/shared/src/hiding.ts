/**
 * Hiding parts of a mesh while editing it (the editor's Hide, Hide others and Show all). Hiding is only about what is
 * drawn and what can be picked: the mesh itself is never changed. Parts are hidden as whole triangles; a point is
 * hidden when every triangle that uses it is.
 */

/** How points are chosen in the editor: whole points, edges (two points) or faces (their corners). */
export type HideMode = "point" | "edge" | "face";

/**
 * The triangles that Hide takes away for a selection of points. In Points mode every triangle that uses a selected
 * point goes (hiding a point hides the faces around it). In Edges and Faces mode only triangles whose three corners are
 * all selected go, so hiding one face leaves its neighbours alone.
 */
export function trianglesToHide(
  indices: ArrayLike<number>,
  selected: readonly number[],
  mode: HideMode,
): number[] {
  const chosen = new Set(selected);
  const out: number[] = [];
  for (let t = 0; t < indices.length / 3; t++) {
    const corners = [indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!];
    const count = corners.filter((p) => chosen.has(p)).length;
    if (mode === "point" ? count > 0 : count === 3) out.push(t);
  }
  return out;
}

/** The triangles that stay when everything NOT selected is hidden ("Hide others"): the opposite of `trianglesToHide`. */
export function trianglesToHideOthers(
  indices: ArrayLike<number>,
  selected: readonly number[],
  mode: HideMode,
): number[] {
  const hide = new Set(trianglesToHide(indices, selected, mode));
  const out: number[] = [];
  for (let t = 0; t < indices.length / 3; t++) if (!hide.has(t)) out.push(t);
  return out;
}

/** The triangle list without the hidden triangles (what to draw and to pick from). */
export function visibleIndices(
  indices: ArrayLike<number>,
  hidden: ReadonlySet<number>,
): Uint32Array {
  const out: number[] = [];
  for (let t = 0; t < indices.length / 3; t++) {
    if (hidden.has(t)) continue;
    out.push(indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!);
  }
  return Uint32Array.from(out);
}

/**
 * The points that are hidden because every triangle using them is hidden. A point no triangle uses is never hidden
 * (there is nothing to hide it with).
 */
export function hiddenPoints(
  indices: ArrayLike<number>,
  hidden: ReadonlySet<number>,
  pointCount: number,
): number[] {
  const used = new Uint8Array(pointCount);
  const shown = new Uint8Array(pointCount);
  for (let t = 0; t < indices.length / 3; t++) {
    for (let k = 0; k < 3; k++) {
      const p = indices[t * 3 + k]!;
      if (p >= pointCount) continue;
      used[p] = 1;
      if (!hidden.has(t)) shown[p] = 1;
    }
  }
  const out: number[] = [];
  for (let p = 0; p < pointCount; p++) if (used[p] && !shown[p]) out.push(p);
  return out;
}

/**
 * A short text that changes when the triangles or the number of points change, and stays the same when only points
 * move. Hidden parts are remembered by triangle number, so they stay valid exactly while this text stays the same.
 */
export function topologyFingerprint(
  indices: ArrayLike<number>,
  pointCount: number,
): string {
  // FNV-1a over the triangle list
  let hash = 0x811c9dc5;
  for (let i = 0; i < indices.length; i++) {
    hash = Math.imul(hash ^ indices[i]!, 0x01000193) >>> 0;
  }
  return `${pointCount}:${indices.length}:${hash.toString(16)}`;
}

/** The union of two lists of triangle numbers, sorted. */
export function unionTriangles(
  a: readonly number[],
  b: readonly number[],
): number[] {
  return [...new Set([...a, ...b])].sort((x, y) => x - y);
}
