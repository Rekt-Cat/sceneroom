import {
  AmbientLight,
  Box3,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { thumbnailFraming, type AssetInfo } from "@sceneroom/shared";
import { loadModelScene } from "./loadModel";

/** Width and height of a thumbnail, in pixels (shown smaller, so it stays sharp on dense screens). */
export const THUMBNAIL_SIZE_PX = 128;

/** The camera's field of view for the picture, in degrees. */
const THUMBNAIL_FOV = 35;

/** Which way the camera looks from, seen from above: a little to the side and above (not normalised). */
const THUMBNAIL_VIEW_DIRECTION: [number, number, number] = [1, 0.75, 1.2];

let renderer: WebGLRenderer | null = null;

/** One small drawing surface, made on first use and reused (browsers allow only a few at once). */
function getRenderer(): WebGLRenderer {
  if (!renderer) {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(THUMBNAIL_SIZE_PX, THUMBNAIL_SIZE_PX, false);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

/** Pictures already made, by asset id. A failure is forgotten so a later try can work. */
const cache = new Map<string, Promise<string>>();

/** Pictures are drawn one after another: they share one drawing surface. */
let queue: Promise<unknown> = Promise.resolve();

/** A small picture (a data URL) of an imported model, drawn once and remembered for this visit. */
export function getThumbnail(info: AssetInfo): Promise<string> {
  const cached = cache.get(info.id);
  if (cached) return cached;
  const promise = (queue = queue.then(
    () => draw(info),
    () => draw(info),
  )) as Promise<string>;
  cache.set(info.id, promise);
  promise.catch(() => cache.delete(info.id));
  return promise;
}

/** Forgets the picture of a file (when the file is deleted). */
export function forgetThumbnail(assetId: string): void {
  cache.delete(assetId);
}

async function draw(info: AssetInfo): Promise<string> {
  const root = await loadModelScene(info.id);
  const scene = new Scene();
  const model = clone(root);
  scene.add(model);
  scene.add(new AmbientLight(0xffffff, 1.2));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 5, 4);
  scene.add(sun);

  // Measure the copy itself, so the framing matches what is drawn
  const box = new Box3().setFromObject(model);
  const { target, distance } = thumbnailFraming(
    [box.min.x, box.min.y, box.min.z],
    [box.max.x, box.max.y, box.max.z],
    THUMBNAIL_FOV,
  );
  const camera = new PerspectiveCamera(
    THUMBNAIL_FOV,
    1,
    distance / 100,
    distance * 4,
  );
  const [dx, dy, dz] = THUMBNAIL_VIEW_DIRECTION;
  const length = Math.hypot(dx, dy, dz);
  camera.position.set(
    target[0] + (dx / length) * distance,
    target[1] + (dy / length) * distance,
    target[2] + (dz / length) * distance,
  );
  camera.lookAt(target[0], target[1], target[2]);

  const gl = getRenderer();
  gl.render(scene, camera);
  return gl.domElement.toDataURL("image/png");
}
