import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import {
  deformMesh,
  type Modifier,
  type PrimitiveKind,
} from "@sceneroom/shared";

/** How many pieces around the round shapes (sphere, cylinder, cone). Bending and twisting need cuts along the length, not around. */
const ROUND_SEGMENTS = 32;

/** The plain shape of a kind, cut into `segments` pieces along each straight side (all about 1 unit in size). */
function baseGeometry(kind: PrimitiveKind, segments: number): BufferGeometry {
  switch (kind) {
    case "cube":
      return new BoxGeometry(1, 1, 1, segments, segments, segments);
    case "sphere":
      // A sphere is already cut into rings and slices; extra segments would not change its look
      return new SphereGeometry(0.5, ROUND_SEGMENTS, ROUND_SEGMENTS / 2);
    case "cylinder":
      return new CylinderGeometry(0.5, 0.5, 1, ROUND_SEGMENTS, segments);
    case "plane":
      return new PlaneGeometry(1, 1, segments, segments);
    case "cone":
      return new ConeGeometry(0.5, 1, ROUND_SEGMENTS, segments);
  }
}

/**
 * The geometry of a shape with its modifiers applied. The caller owns the result and must `dispose()`
 * it when it is no longer used. With no active modifier the plain shape is returned unchanged.
 */
export function buildShapeGeometry(
  kind: PrimitiveKind,
  segments: number,
  modifiers: readonly Modifier[],
): BufferGeometry {
  const geometry = baseGeometry(kind, segments);
  if (!modifiers.some((modifier) => modifier.enabled)) return geometry;

  const position = geometry.getAttribute("position");
  const before = position.count;
  const index = geometry.index;
  // Every built-in shape has triangles; a shape without would be read as one triangle after another
  const indices = index
    ? Uint32Array.from(index.array)
    : Uint32Array.from({ length: before }, (_, i) => i);
  const result = deformMesh(
    { positions: position.array as Float32Array, indices },
    modifiers,
  );
  geometry.setAttribute("position", new BufferAttribute(result.positions, 3));
  geometry.setIndex(new BufferAttribute(result.indices, 1));
  // The pieces of the old index (used for several materials) no longer line up
  geometry.clearGroups();
  // Mirror and array change how many points there are, so the old picture coordinates no longer fit
  if (result.positions.length / 3 !== before) geometry.deleteAttribute("uv");
  // The old normals no longer match the new shape; click detection also needs fresh bounds
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
