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
