import { Vector3, type Camera, type Object3D } from "three";

/**
 * Where every point of a mesh is on the screen, in the same pixels as the page (x, y, x, y, ...). A point
 * behind the camera has NaN. `positions` are the points in the object's own space; `rect` is the screen
 * rectangle of the 3D view (so the result matches mouse positions).
 */
export function projectPoints(
  object: Object3D,
  camera: Camera,
  rect: { left: number; top: number; width: number; height: number },
  positions: ArrayLike<number>,
): Float32Array {
  object.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();
  const projected = new Float32Array((positions.length / 3) * 2);
  const point = new Vector3();
  for (let i = 0; i * 3 + 2 < positions.length; i++) {
    point
      .set(positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!)
      .applyMatrix4(object.matrixWorld)
      .project(camera);
    // After projecting, z beyond 1 means behind the camera (or past the far plane)
    if (point.z > 1 || point.z < -1) {
      projected[i * 2] = NaN;
      projected[i * 2 + 1] = NaN;
    } else {
      projected[i * 2] = rect.left + ((point.x + 1) / 2) * rect.width;
      projected[i * 2 + 1] = rect.top + ((1 - point.y) / 2) * rect.height;
    }
  }
  return projected;
}
