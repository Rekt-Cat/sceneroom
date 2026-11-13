import { Box3, Mesh, Vector3, type Camera, type Object3D } from "three";
import { boundsOfPoints, type Rect } from "@sceneroom/shared";

/** The part of the page the 3D view covers, in pixels (like `getBoundingClientRect`). */
export type ViewArea = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** The box around an object in the 3D world. A shape counts only its own geometry; a group (an imported model) counts everything inside it. */
export function worldBoxOf(object: Object3D): Box3 | null {
  object.updateWorldMatrix(true, false);
  let box: Box3;
  if (object instanceof Mesh) {
    // Only this mesh's own shape: setFromObject would also include the objects inside it
    object.geometry.computeBoundingBox();
    if (!object.geometry.boundingBox) return null;
    box = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
  } else {
    box = new Box3().setFromObject(object);
  }
  return box.isEmpty() ? null : box;
}

/**
 * Where an object lands on the screen, as a rectangle in page pixels: the corners of its box, seen
 * through the camera. Corners behind the camera are left out. Null if it has no box or is not in
 * front of the camera at all.
 */
export function screenBoundsOf(
  object: Object3D,
  camera: Camera,
  view: ViewArea,
): Rect | null {
  const box = worldBoxOf(object);
  if (!box) return null;
  const corners: { x: number; y: number }[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const point = new Vector3(x, y, z).project(camera);
        if (point.z > 1) continue; // behind the camera
        corners.push({
          x: view.left + (point.x * 0.5 + 0.5) * view.width,
          y: view.top + (-point.y * 0.5 + 0.5) * view.height,
        });
      }
    }
  }
  return boundsOfPoints(corners);
}
