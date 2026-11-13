import type { Scene, Transform } from "./scene";
import { topLevelSelection } from "./selection";
import { isEffectivelyLocked } from "./sceneTree";

/** One object moving to a new parent (null = top level), with the transform it should have there. */
export type ReparentMove = {
  id: string;
  parentId: string | null;
  transform: Transform;
};

/** True if `nodeId` is `rootId` itself or sits anywhere below it. */
export function isInSubtree(
  scene: Scene,
  nodeId: string,
  rootId: string,
): boolean {
  const visited = new Set<string>();
  let current: string | null = nodeId;
  while (current !== null && !visited.has(current)) {
    if (current === rootId) return true;
    visited.add(current);
    current = scene.nodes[current]?.parentId ?? null;
  }
  return false;
}

/**
 * Whether `id` may be moved under `parentId` (null = top level). Not allowed: an object that does
 * not exist, a parent that does not exist, a locked object (or one inside a locked object), a locked
 * parent, an object under itself, or under something below it (that would make a loop and cut the
 * whole branch off the scene).
 */
export function canReparent(
  scene: Scene,
  id: string,
  parentId: string | null,
): boolean {
  if (!scene.nodes[id]) return false;
  // A locked object cannot be moved, and nothing can be put inside a locked object
  if (isEffectivelyLocked(scene, id)) return false;
  if (parentId === null) return true;
  if (!scene.nodes[parentId]) return false;
  if (isEffectivelyLocked(scene, parentId)) return false;
  return !isInSubtree(scene, parentId, id);
}

/**
 * The selected objects that can all move under `parentId`: only the top ones of the selection (a
 * child moves along with its parent). Empty if any of them cannot go there.
 */
export function movableSelection(
  scene: Scene,
  ids: readonly string[],
  parentId: string | null,
): string[] {
  const top = topLevelSelection(scene, ids);
  return top.every((id) => canReparent(scene, id, parentId)) ? top : [];
}

/**
 * Moves objects to new parents. The moves are applied one after the other, each checked against the
 * scene as it is by then. If any move is not allowed this throws and nothing is changed.
 */
export function reparentNodes(
  scene: Scene,
  moves: readonly ReparentMove[],
): Scene {
  let next = scene;
  for (const move of moves) {
    if (!canReparent(next, move.id, move.parentId)) {
      throw new Error(
        `Cannot move "${move.id}" under "${move.parentId ?? "top level"}"`,
      );
    }
    const node = next.nodes[move.id]!;
    next = {
      ...next,
      nodes: {
        ...next.nodes,
        [move.id]: {
          ...node,
          parentId: move.parentId,
          transform: move.transform,
        },
      },
    };
  }
  return next;
}
