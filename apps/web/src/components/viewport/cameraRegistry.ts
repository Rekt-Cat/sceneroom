import type { PerspectiveCamera } from "three";

/**
 * The normal (perspective) 3D camera. The big view can swap the editor's camera for a flat side camera; the
 * four-view peek and the way back to the normal view need the original, so it is kept here (it is not scene
 * data, just what the screen is using).
 */
let perspective: PerspectiveCamera | null = null;

export function setPerspectiveCamera(camera: PerspectiveCamera | null): void {
  perspective = camera;
}

export function getPerspectiveCamera(): PerspectiveCamera | null {
  return perspective;
}
