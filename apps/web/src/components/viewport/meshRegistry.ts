import type { Object3D } from "three";

/**
 * Which three.js object draws which scene node. The group gizmo and the drag-a-box selection need to
 * reach the real objects (to move them while dragging, or to measure where they are on screen).
 * This is not scene data (the store is), just a lookup of what is currently on screen.
 */
const meshes = new Map<string, Object3D>();

export function registerMesh(id: string, object: Object3D | null): void {
  if (object) meshes.set(id, object);
  else meshes.delete(id);
}

export function getMesh(id: string): Object3D | undefined {
  return meshes.get(id);
}
