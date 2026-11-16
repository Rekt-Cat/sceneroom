import { Raycaster, Vector3, type Camera, type Object3D } from "three";

/**
 * Which spots of a mesh the camera can see. A spot (given in the mesh's own space) is hidden when a face of
 * the mesh stands in front of it on the way from the camera. Spots lying ON the surface count as visible
 * (a small allowance is made for that). Used so a click or a box in edit mode only picks points and edges on
 * faces facing the camera, unless X-ray is on.
 */
export function visibleSpots(
  spots: readonly (readonly [number, number, number])[],
  object: Object3D,
  camera: Camera,
): boolean[] {
  object.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();
  const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const raycaster = new Raycaster();
  const world = new Vector3();
  const direction = new Vector3();
  return spots.map(([x, y, z]) => {
    world.set(x, y, z).applyMatrix4(object.matrixWorld);
    direction.copy(world).sub(origin);
    const distance = direction.length();
    if (distance < 1e-9) return true;
    direction.divideScalar(distance);
    // Anything hit before the spot (a little short of it, for rounding) hides it
    const allowance = Math.max(1e-4, distance * 2e-3);
    raycaster.set(origin, direction);
    raycaster.far = distance - allowance;
    return raycaster.intersectObject(object, false).length === 0;
  });
}

/** The points among `candidates` that can be seen, in the same order. `positions` are all the mesh's points (x, y, z, ...). */
export function visiblePoints(
  candidates: readonly number[],
  positions: ArrayLike<number>,
  object: Object3D,
  camera: Camera,
): number[] {
  const seen = visibleSpots(
    candidates.map(
      (p) =>
        [
          positions[p * 3]!,
          positions[p * 3 + 1]!,
          positions[p * 3 + 2]!,
        ] as const,
    ),
    object,
    camera,
  );
  return candidates.filter((_, i) => seen[i]);
}

/**
 * Hidden points are only filtered out for a box with at most this many points inside; a bigger box (a whole
 * dense mesh) would need too many tests, and takes everything inside (as if X-ray were on).
 */
export const MAX_POINTS_TO_TEST_FOR_VISIBILITY = 4000;
