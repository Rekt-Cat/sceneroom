import { OrthographicCamera, Vector3 } from "three";
import {
  SIDE_VIEW_NEAR_ROOM,
  sideFrame,
  zoomForFrame,
  type SideView,
} from "@sceneroom/shared";
import { viewBox } from "./selectionBox";

/**
 * A flat camera for the big view of one side. The editor's camera sizes a flat camera in pixels (a view as wide
 * as the canvas in pixels), so the zoom is pixels per world unit: the frame (see `sideFrame`) then fills the
 * canvas with the selection and some room round it. Returns the point the camera looks at.
 */
export function placeSideCamera(
  camera: OrthographicCamera,
  view: SideView,
  size: { width: number; height: number },
): [number, number, number] {
  const frame = sideFrame(
    viewBox(),
    view,
    size.width / Math.max(size.height, 1),
  );
  // We size this camera ourselves (and again when the view is resized), the renderer must leave it alone
  (camera as unknown as { manual: boolean }).manual = true;
  camera.up.set(...frame.up);
  camera.position.set(...frame.position);
  camera.near = frame.near;
  camera.far = frame.far;
  camera.zoom = zoomForFrame(frame, size.height);
  fitToSize(camera, size);
  camera.lookAt(...frame.target);
  camera.updateMatrixWorld();
  return frame.target;
}

/** Makes a flat camera as many pixels wide and high as the canvas (its zoom turns that into world units). */
export function fitToSize(
  camera: OrthographicCamera,
  size: { width: number; height: number },
): void {
  camera.left = -size.width / 2;
  camera.right = size.width / 2;
  camera.top = size.height / 2;
  camera.bottom = -size.height / 2;
  camera.updateProjectionMatrix();
}

/**
 * Moves the near and far planes of a flat camera that stays where it is, so they hug what is selected NOW (or the
 * whole scene): called when objects move, turn or change size while the big side view is open. Without it the
 * planes would still be where they were when the view was opened, and a turned object would be cut away.
 */
export function updateSlab(camera: OrthographicCamera): void {
  const box = viewBox();
  const forward = camera.getWorldDirection(new Vector3());
  let nearest = Infinity;
  let farthest = -Infinity;
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const depth = new Vector3(x, y, z).sub(camera.position).dot(forward);
        nearest = Math.min(nearest, depth);
        farthest = Math.max(farthest, depth);
      }
    }
  }
  const room = Math.max(farthest - nearest, 1) * SIDE_VIEW_NEAR_ROOM;
  camera.near = Math.max(0.01, nearest - room);
  camera.far = Math.max(camera.near + 0.01, farthest + room);
  camera.updateProjectionMatrix();
}
