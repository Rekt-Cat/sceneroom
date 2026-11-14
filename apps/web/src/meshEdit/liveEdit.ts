import type { BufferAttribute, BufferGeometry } from "three";
import { translateSelected, type Vec3 } from "@sceneroom/shared";

/**
 * Moves the selected points of a mesh geometry while a drag is going on: each is put at where it was when
 * the drag began plus `delta` (in the mesh's own space). The lines and dots follow because they share the
 * same point list; the shading is worked out again so the surface looks right while you drag. Nothing is
 * stored until the drag ends.
 */
export function moveSelectedLive(
  geometry: BufferGeometry,
  start: Float32Array,
  selected: readonly number[],
  delta: Vec3,
): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  translateSelected(start, selected, delta, position.array as Float32Array);
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  // Clicking and the selection box use these; they must match the new shape
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** A copy of the points of a geometry as they are right now (to keep at the start of a drag, or to store). */
export function copyPositions(geometry: BufferGeometry): Float32Array {
  return new Float32Array(
    (geometry.getAttribute("position") as BufferAttribute).array,
  );
}
