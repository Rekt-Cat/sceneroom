import { OrthographicCamera } from "three";
import { sideFrame, zoomForFrame, type SideView } from "@sceneroom/shared";
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
