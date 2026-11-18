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
  weldGroups,
  type Crease,
  type Modifier,
  type PrimitiveKind,
  type ShapeMesh,
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
  return withModifiers(baseGeometry(kind, segments), modifiers);
}

/**
 * The geometry of an editable mesh with its modifiers applied (the mesh's own points are never
 * changed). The caller owns the result and must `dispose()` it. Normals are worked out from the triangles.
 */
export function buildMeshGeometry(
  mesh: ShapeMesh,
  modifiers: readonly Modifier[],
): BufferGeometry {
  const geometry = new BufferGeometry();
  // Copies: the stored mesh is shared, and the geometry may be changed by the modifiers
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(mesh.positions), 3),
  );
  geometry.setIndex(new BufferAttribute(new Uint32Array(mesh.indices), 1));
  // The map of the surface on the flat texture, when the mesh has one (the checker view and GLB export use it)
  if (mesh.uvs) {
    geometry.setAttribute(
      "uv",
      new BufferAttribute(new Float32Array(mesh.uvs), 2),
    );
  }
  geometry.computeVertexNormals();
  // Unwrapping splits points where the map is cut; the surface must not look cut there too
  if (mesh.uvs) smoothAcrossSplitPoints(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // The creases ride along: the modifiers read them (Smooth), and edit mode draws them
  if (mesh.creases) geometry.userData[CREASES_KEY] = mesh.creases;
  // The seams ride along too (edit mode draws them; they are not changed by the modifiers)
  if (mesh.seams) geometry.userData[SEAMS_KEY] = mesh.seams;
  return withModifiers(geometry, modifiers);
}

/** Points on one spot whose normals differ by less than this many degrees are shaded as one (a cut in the UV map, not a corner). */
export const SPLIT_POINT_SMOOTH_DEGREES = 40;

/**
 * Points that sit on the same spot (a UV map cut splits a point in two) get the average of their normals when those
 * point nearly the same way, so the cut does not show as a line in the shading. Real corners (a cube's edge, 90
 * degrees) keep their separate normals.
 */
export function smoothAcrossSplitPoints(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const normal = geometry.getAttribute("normal") as BufferAttribute;
  const groups = weldGroups(position.array as Float32Array);
  const limit = Math.cos((SPLIT_POINT_SMOOTH_DEGREES * Math.PI) / 180);
  const out = new Float32Array(normal.array.length);
  out.set(normal.array as Float32Array);
  for (const members of groups.members) {
    if (members.length < 2) continue;
    for (const i of members) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const j of members) {
        const d =
          normal.getX(i) * normal.getX(j) +
          normal.getY(i) * normal.getY(j) +
          normal.getZ(i) * normal.getZ(j);
        if (d >= limit) {
          x += normal.getX(j);
          y += normal.getY(j);
          z += normal.getZ(j);
        }
      }
      const length = Math.hypot(x, y, z);
      if (length > 1e-9) {
        out[i * 3] = x / length;
        out[i * 3 + 1] = y / length;
        out[i * 3 + 2] = z / length;
      }
    }
  }
  normal.array.set(out);
  normal.needsUpdate = true;
}

/** Where a geometry keeps the creases of the mesh it was made from. */
export const CREASES_KEY = "creases";
/** Where a geometry keeps the seams of the mesh it was made from. */
export const SEAMS_KEY = "seams";

/** The points and triangles of a geometry, copied out (to store as a mesh). */
export function geometryToMesh(geometry: BufferGeometry): ShapeMesh {
  const position = geometry.getAttribute("position");
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
  }
  const index = geometry.index;
  const indices = index
    ? Uint32Array.from(index.array)
    : Uint32Array.from({ length: position.count }, (_, i) => i);
  const uvs = uvsOf(geometry, position.count);
  return { positions, indices, ...(uvs ? { uvs } : {}) };
}

/** The UVs of a geometry (u, v for every point), or undefined if it has none or they do not fit the points. */
function uvsOf(
  geometry: BufferGeometry,
  points: number,
): Float32Array | undefined {
  const uv = geometry.getAttribute("uv");
  if (!uv || uv.count !== points || uv.itemSize !== 2) return undefined;
  const uvs = new Float32Array(points * 2);
  for (let i = 0; i < points; i++) {
    uvs[i * 2] = uv.getX(i);
    uvs[i * 2 + 1] = uv.getY(i);
  }
  return uvs;
}

/** Applies the active modifiers to a geometry (made here, so it may be changed) and refreshes what depends on its points. */
function withModifiers(
  geometry: BufferGeometry,
  modifiers: readonly Modifier[],
): BufferGeometry {
  if (!modifiers.some((modifier) => modifier.enabled)) return geometry;
  const position = geometry.getAttribute("position");
  const before = position.count;
  const index = geometry.index;
  // Every built-in shape has triangles; a shape without would be read as one triangle after another
  const indices = index
    ? Uint32Array.from(index.array)
    : Uint32Array.from({ length: before }, (_, i) => i);
  const result = deformMesh(
    {
      positions: position.array as Float32Array,
      indices,
      creases: geometry.userData[CREASES_KEY] as readonly Crease[] | undefined,
      uvs: uvsOf(geometry, before),
    },
    modifiers,
  );
  // After the modifiers the creases (if any survive) belong to the new points; the editor only edits unmodified meshes
  delete geometry.userData[CREASES_KEY];
  delete geometry.userData[SEAMS_KEY];
  geometry.setAttribute("position", new BufferAttribute(result.positions, 3));
  geometry.setIndex(new BufferAttribute(result.indices, 1));
  // The pieces of the old index (used for several materials) no longer line up
  geometry.clearGroups();
  // Modifiers that keep the map (bend, twist, mirror, array ...) hand it back; the others change how many points
  // there are, so the old picture coordinates no longer fit and are dropped
  if (result.uvs) {
    geometry.setAttribute("uv", new BufferAttribute(result.uvs, 2));
  } else if (result.positions.length / 3 !== before) {
    geometry.deleteAttribute("uv");
  }
  // The old normals no longer match the new shape; click detection also needs fresh bounds
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
