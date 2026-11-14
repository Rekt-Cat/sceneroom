import type { Scene, SceneNode } from "./scene";

/**
 * The order of objects that share a parent. Each object has a number, `order`; objects with a smaller
 * number come first, and objects with the same number (all of them, in scenes saved before the
 * number existed) keep the order they were created in.
 */

/** The parent a node really sits in: its `parentId`, or null (top level) if that parent does not exist. */
function effectiveParent(scene: Scene, node: SceneNode): string | null {
  return node.parentId !== null && scene.nodes[node.parentId]
    ? node.parentId
    : null;
}

/** Every parent's children, each list in display order. Key null = the top level. */
export function groupChildren(scene: Scene): Map<string | null, SceneNode[]> {
  const groups = new Map<string | null, { node: SceneNode; index: number }[]>();
  Object.values(scene.nodes).forEach((node, index) => {
    const key = effectiveParent(scene, node);
    const list = groups.get(key) ?? [];
    list.push({ node, index });
    groups.set(key, list);
  });
  return new Map(
    [...groups].map(([key, list]) => [
      key,
      list
        .sort((a, b) => a.node.order - b.node.order || a.index - b.index)
        .map((entry) => entry.node),
    ]),
  );
}

/** The children of a parent (null = top level), in display order. */
export function childrenOf(scene: Scene, parentId: string | null): SceneNode[] {
  return groupChildren(scene).get(parentId) ?? [];
}

/** The `order` that puts a new object after all the others in `parentId`. */
export function nextOrder(scene: Scene, parentId: string | null): number {
  const siblings = childrenOf(scene, parentId);
  return siblings.length === 0
    ? 0
    : Math.max(...siblings.map((s) => s.order)) + 1;
}

/**
 * Moves a node to a place among the objects in its parent: just before `beforeId`, or at the end if
 * `beforeId` is null (or is not one of them). The siblings are numbered 0, 1, 2... afterwards. Returns
 * the same scene if the node is already there, so a no-op move records nothing.
 */
export function placeAmongSiblings(
  scene: Scene,
  id: string,
  beforeId: string | null,
): Scene {
  const node = scene.nodes[id];
  if (!node || beforeId === id) return scene;

  const current = childrenOf(scene, effectiveParent(scene, node)).map(
    (s) => s.id,
  );
  const others = current.filter((siblingId) => siblingId !== id);
  const found = beforeId === null ? -1 : others.indexOf(beforeId);
  const index = found === -1 ? others.length : found;
  const ordered = [...others.slice(0, index), id, ...others.slice(index)];
  if (ordered.every((siblingId, i) => siblingId === current[i])) return scene;

  let nodes = scene.nodes;
  ordered.forEach((siblingId, i) => {
    const sibling = scene.nodes[siblingId]!;
    if (sibling.order !== i)
      nodes = { ...nodes, [siblingId]: { ...sibling, order: i } };
  });
  return { ...scene, nodes };
}

/** Where a dragged row lands, relative to the row it is dropped on. */
export type DropZone = "before" | "into" | "after";

/** A place in the tree: inside `parentId` (null = top level), just before `beforeId` (null = at the end). */
export type DropPlacement = {
  parentId: string | null;
  beforeId: string | null;
};

/**
 * Turns "dropped on this part of this row" into a place in the tree:
 * - into: the last child of that row
 * - before: just before that row, in the same parent
 * - after: just after that row, in the same parent; but if that row is an open parent with children,
 *   the first of its children (the place right under it, where the list shows the next row)
 */
export function dropPlacement(
  scene: Scene,
  targetId: string,
  zone: DropZone,
  targetIsOpen: boolean,
): DropPlacement | null {
  const target = scene.nodes[targetId];
  if (!target) return null;
  const parentId = effectiveParent(scene, target);

  if (zone === "into") return { parentId: targetId, beforeId: null };
  if (zone === "before") return { parentId, beforeId: targetId };

  const kids = childrenOf(scene, targetId);
  if (targetIsOpen && kids.length > 0) {
    return { parentId: targetId, beforeId: kids[0]!.id };
  }
  const siblings = childrenOf(scene, parentId);
  const at = siblings.findIndex((s) => s.id === targetId);
  return { parentId, beforeId: siblings[at + 1]?.id ?? null };
}

/**
 * The place one step up or down among an object's siblings, for "Move up" and "Move down". Null if it
 * is already first (up) or last (down).
 */
export function stepPlacement(
  scene: Scene,
  id: string,
  direction: "up" | "down",
): DropPlacement | null {
  const node = scene.nodes[id];
  if (!node) return null;
  const parentId = effectiveParent(scene, node);
  const siblings = childrenOf(scene, parentId);
  const at = siblings.findIndex((s) => s.id === id);
  if (direction === "up") {
    const previous = siblings[at - 1];
    return previous ? { parentId, beforeId: previous.id } : null;
  }
  if (at === siblings.length - 1) return null;
  return { parentId, beforeId: siblings[at + 2]?.id ?? null };
}
