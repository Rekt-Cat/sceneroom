import type { Scene } from "./scene";

/** Returns the id if it exists in the scene, otherwise null (nothing selected). */
export function resolveSelection(
  scene: Scene,
  id: string | null,
): string | null {
  return id !== null && scene.nodes[id] ? id : null;
}
