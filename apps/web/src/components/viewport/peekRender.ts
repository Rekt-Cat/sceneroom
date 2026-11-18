import {
  Color,
  OrthographicCamera,
  type Scene,
  type WebGLRenderer,
} from "three";
import { isSideView, peekTileRects, sideFrame } from "@sceneroom/shared";
import { useViewStore } from "@/store/viewStore";
import { getPerspectiveCamera } from "./cameraRegistry";
import { withFlatBackground, withRealBackground } from "./flatBackground";
import { viewBox } from "./selectionBox";

/** The colour behind and between the four tiles. */
const BACKDROP = 0x0e1114;

/** One flat camera, reused for every side tile of every frame. */
const sideCamera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 100);

/**
 * Draws the four views of the peek into one canvas: each tile is a rectangle of the canvas (the scissor and
 * the viewport of the renderer) and gets its own camera. The three flat side views are orthographic cameras
 * framed on the selection (see `sideFrame`); the perspective tile uses the normal camera with the tile's
 * shape for a moment. Works without React, so it can be tested with a stand-in renderer.
 */
export function renderPeek(
  gl: Pick<
    WebGLRenderer,
    | "setScissorTest"
    | "setViewport"
    | "setScissor"
    | "setClearColor"
    | "getClearColor"
    | "getClearAlpha"
    | "clear"
    | "render"
  >,
  scene: Scene,
  size: { width: number; height: number },
): void {
  const tiles = useViewStore.getState().peekTiles;
  const rects = peekTileRects(size.width, size.height);
  const box = viewBox();
  const perspective = getPerspectiveCamera();

  const previousColor = gl.getClearColor(new Color());
  const previousAlpha = gl.getClearAlpha();
  // Clear the whole canvas to the backdrop once, so the gaps between the tiles are plain
  gl.setScissorTest(false);
  gl.setViewport(0, 0, size.width, size.height);
  gl.setClearColor(BACKDROP, 1);
  gl.clear();
  gl.setClearColor(previousColor, previousAlpha);

  gl.setScissorTest(true);
  rects.forEach((rect, i) => {
    const view = tiles[i] ?? "perspective";
    // The renderer counts from the bottom of the canvas, the tiles from the top
    const y = size.height - rect.y - rect.height;
    gl.setViewport(rect.x, y, rect.width, rect.height);
    gl.setScissor(rect.x, y, rect.width, rect.height);
    const aspect = rect.width / Math.max(rect.height, 1);
    if (isSideView(view)) {
      const frame = sideFrame(box, view, aspect);
      sideCamera.left = -frame.halfWidth;
      sideCamera.right = frame.halfWidth;
      sideCamera.top = frame.halfHeight;
      sideCamera.bottom = -frame.halfHeight;
      sideCamera.near = frame.near;
      sideCamera.far = frame.far;
      sideCamera.zoom = 1;
      sideCamera.up.set(...frame.up);
      sideCamera.position.set(...frame.position);
      sideCamera.lookAt(...frame.target);
      sideCamera.updateProjectionMatrix();
      sideCamera.updateMatrixWorld();
      withFlatBackground(scene, () => gl.render(scene, sideCamera));
    } else if (perspective) {
      // The normal camera, with the shape of this tile for the moment it takes to draw it
      const before = perspective.aspect;
      perspective.aspect = aspect;
      perspective.updateProjectionMatrix();
      withRealBackground(scene, () => gl.render(scene, perspective));
      perspective.aspect = before;
      perspective.updateProjectionMatrix();
    }
  });
  gl.setScissorTest(false);
  gl.setViewport(0, 0, size.width, size.height);
}
