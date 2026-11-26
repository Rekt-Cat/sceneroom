import { Euler, Quaternion, Vector3, type Object3D } from "three";
import type { Scene, SceneNode, Transform } from "@sceneroom/shared";

/**
 * Smooth movement for changes made by other people: when someone else moves, turns or resizes an object, it glides to
 * the new place instead of jumping. Only the picture glides: the scene data has the new values at once. The 3D view
 * draws the new transform, and each frame `stepGlides` puts the object part of the way there (RemoteGlide in
 * PresenceLayer.tsx runs it).
 */

/** How long a glide takes (ms). */
export const GLIDE_MS = 250;

type Glide = {
  start: number;
  /** Where the object was drawn when the change arrived. */
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  /** The transform it is going to. If the object gets another one (not from outside), the glide is dropped. */
  to: Transform;
};

const glides = new Map<string, Glide>();

/**
 * Call just BEFORE someone else's change is put on screen: notes, for every object whose transform it changes, where
 * the object is drawn now (also in the middle of an earlier glide, so a stream of changes stays smooth). New objects
 * appear where they are, and an object that got another parent jumps (its numbers mean something else there).
 */
export function planGlides(
  current: Scene,
  incoming: Scene,
  getObject: (id: string) => Object3D | undefined,
  now: number = performance.now(),
): void {
  for (const [id, node] of Object.entries(incoming.nodes)) {
    const before = current.nodes[id];
    if (!before || before.transform === node.transform) continue;
    const object = getObject(id);
    if (!object || before.parentId !== node.parentId) {
      glides.delete(id);
      continue;
    }
    glides.set(id, {
      start: now,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
      to: node.transform,
    });
  }
}

function place(
  object: Object3D,
  { position, rotation, scale }: Transform,
): void {
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.scale.set(...scale);
}

/** Moves every gliding object one step. Call once a frame, before the picture is drawn. */
export function stepGlides(
  getNode: (id: string) => SceneNode | undefined,
  getObject: (id: string) => Object3D | undefined,
  now: number = performance.now(),
): void {
  for (const [id, glide] of glides) {
    const node = getNode(id);
    const object = getObject(id);
    if (!node || !object) {
      glides.delete(id);
      continue;
    }
    const done = Math.min(1, Math.max(0, (now - glide.start) / GLIDE_MS));
    // The scene changed again meanwhile (this person's own Undo, say): show that at once
    if (node.transform !== glide.to || done === 1) {
      place(object, node.transform);
      glides.delete(id);
      continue;
    }
    // Fast at first, gently at the end
    const eased = 1 - (1 - done) ** 3;
    const to = glide.to;
    object.position
      .copy(glide.position)
      .lerp(new Vector3(...to.position), eased);
    object.quaternion
      .copy(glide.quaternion)
      .slerp(new Quaternion().setFromEuler(new Euler(...to.rotation)), eased);
    object.scale.copy(glide.scale).lerp(new Vector3(...to.scale), eased);
  }
}

/** Forgets every glide (the project goes offline). */
export function clearGlides(): void {
  glides.clear();
}
