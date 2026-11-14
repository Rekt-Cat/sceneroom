import type { Scene } from "./scene";

/** Keeps only ids that exist in the scene, without repeats, in the original order. */
export function resolveSelection(
  scene: Scene,
  ids: readonly string[],
): string[] {
  return [...new Set(ids)].filter((id) => scene.nodes[id] !== undefined);
}

/** Adds the id to the selection, or removes it if it is already selected (Shift + click). */
export function toggleInSelection(
  ids: readonly string[],
  id: string,
): string[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}

/**
 * Drops every selected node that has a selected ancestor. Acting on a parent already acts on its
 * children (delete, duplicate), so keeping both would handle the children twice.
 */
export function topLevelSelection(
  scene: Scene,
  ids: readonly string[],
): string[] {
  const selected = new Set(ids);
  return ids.filter((id) => {
    const visited = new Set<string>();
    let parentId = scene.nodes[id]?.parentId ?? null;
    while (parentId !== null && !visited.has(parentId)) {
      if (selected.has(parentId)) return false;
      visited.add(parentId);
      parentId = scene.nodes[parentId]?.parentId ?? null;
    }
    return true;
  });
}

/**
 * The ids from `anchorId` to `targetId` in list order, both included, whichever comes first (what
 * Shift + click does in a list). `orderedIds` is the rows as they appear on screen. With no anchor, or an
 * anchor that is not in the list, it is just the target. An unknown target gives nothing.
 */
export function rangeBetween(
  orderedIds: readonly string[],
  anchorId: string | null,
  targetId: string,
): string[] {
  const to = orderedIds.indexOf(targetId);
  if (to === -1) return [];
  const from = anchorId === null ? -1 : orderedIds.indexOf(anchorId);
  if (from === -1) return [targetId];
  return orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1);
}
