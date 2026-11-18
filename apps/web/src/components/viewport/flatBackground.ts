import { Color, type Scene } from "three";
import { useSceneStore } from "@/store/sceneStore";

/**
 * The colour behind the scene in the flat side views. The sky is a picture wrapped round the viewer, which
 * only makes sense for a camera with perspective: a flat (orthographic) camera sees a small patch of it as a
 * stray blue and grey box. So the flat views use one plain colour: the background colour, or the horizon
 * colour of the sky.
 */
export function flatBackgroundColor(): Color {
  const { environment } = useSceneStore.getState().scene;
  return new Color(
    environment.backgroundMode === "sky"
      ? environment.skyHorizon
      : environment.backgroundColor,
  );
}

/** Draws with the plain flat-view background on the scene, then puts the scene's own background back. */
export function withFlatBackground(scene: Scene, draw: () => void): void {
  const saved = scene.background;
  scene.background = flatBackgroundColor();
  try {
    draw();
  } finally {
    scene.background = saved;
  }
}

/** What `syncFlatBackground` remembers between frames. */
export type FlatBackgroundMemory = {
  /** The plain background we put on the scene, while a flat view is showing. */
  mine: Color | null;
  /** The scene's own background, put back afterwards. */
  original: Scene["background"];
};

/**
 * Called every frame: while a flat side view is showing the scene gets the plain colour; when the normal view
 * comes back the scene's own background returns. If the environment settings put in a new background while a
 * flat view is showing, that one is kept as the original.
 */
export function syncFlatBackground(
  scene: Scene,
  flatView: boolean,
  memory: FlatBackgroundMemory,
): void {
  if (flatView && scene.background !== memory.mine) {
    memory.original = scene.background;
    memory.mine = flatBackgroundColor();
    scene.background = memory.mine;
  } else if (!flatView && memory.mine) {
    if (scene.background === memory.mine) scene.background = memory.original;
    memory.mine = null;
  }
}

/**
 * The memory of the one scene on screen. It is shared (not kept by one component) so the four-view peek can find
 * the scene's real background while a flat big view has put the plain colour on the scene.
 */
export const flatMemory: FlatBackgroundMemory = { mine: null, original: null };

/**
 * Draws with the scene's real background (the sky) even while a flat big view has the plain colour on the scene.
 * For the perspective tile of the four-view peek, which must look like the normal view.
 */
export function withRealBackground(scene: Scene, draw: () => void): void {
  if (flatMemory.mine === null || scene.background !== flatMemory.mine) {
    draw();
    return;
  }
  scene.background = flatMemory.original;
  try {
    draw();
  } finally {
    scene.background = flatMemory.mine;
  }
}

/** The name of the ground grid object in the scene, so the flat tiles of the four-view peek can leave it out. */
export const GROUND_GRID_NAME = "ground-grid";

/** Draws without the ground grid (it would lie over the objects in a flat view from above or the side), then puts it back. */
export function withoutGrid(scene: Scene, draw: () => void): void {
  const grid = scene.getObjectByName(GROUND_GRID_NAME);
  const was = grid?.visible ?? false;
  if (grid) grid.visible = false;
  try {
    draw();
  } finally {
    if (grid) grid.visible = was;
  }
}
