import type { AssetInfo, Scene, SceneNode, Transform } from "./scene";
import { addAsset, addNode, availableName, getSubtreeIds } from "./sceneOps";
import { topLevelSelection } from "./selection";
import { isInSubtree } from "./reparent";
import { editableIds, isEffectivelyLocked } from "./sceneTree";

/**
 * What Copy or Cut puts aside. It is a snapshot: later changes to the scene do not change it. It holds
 * the selected objects and everything inside them, and the records of the imported files they use.
 */
export type ClipboardData = {
  /** Every copied object, each parent before its children. */
  nodes: SceneNode[];
  /** The ids (in `nodes`) of the objects that were selected; the rest are inside them. */
  rootIds: string[];
  assets: AssetInfo[];
  /** A cut object is gone from the scene, so its first paste goes back where it was; a copy pastes beside the original. */
  mode: "copy" | "cut";
  /** How many times this has been pasted, so each paste lands a bit further along and copies do not pile up. */
  pasteCount: number;
};

/**
 * Takes the objects (and everything inside them) out of the scene as a clipboard snapshot. Only the top
 * objects of the selection count (a selected child comes with its selected parent). Null if none of the
 * ids exist.
 */
export function copyToClipboard(
  scene: Scene,
  ids: readonly string[],
  mode: "copy" | "cut",
): ClipboardData | null {
  const rootIds = topLevelSelection(
    scene,
    ids.filter((id) => scene.nodes[id] !== undefined),
  );
  if (rootIds.length === 0) return null;

  const nodes = rootIds.flatMap((rootId) =>
    getSubtreeIds(scene, rootId).map((id) => scene.nodes[id]!),
  );
  const assetIds = new Set(
    nodes.flatMap((node) => (node.assetId ? [node.assetId] : [])),
  );
  const assets = [...assetIds].flatMap((id) =>
    scene.assets[id] ? [scene.assets[id]] : [],
  );
  return { nodes, rootIds, assets, mode, pasteCount: 0 };
}

export type PasteOptions = {
  /** The parent the new top objects go into (null = top level). The caller has already checked it is allowed. */
  parentId: string | null;
  /** Moves the new top objects (in their parent's space), so copies do not land exactly on the originals. */
  offset?: [number, number, number];
  /**
   * Transforms to use for the new top objects instead of the copied ones, by the id they were copied from.
   * Used when the parent is a different one than before, so the copy can keep its place in the 3D view.
   */
  rootTransforms?: Readonly<Record<string, Transform>>;
};

/**
 * Puts the clipboard's objects into the scene as NEW objects (new ids, same structure inside), the top
 * ones inside `options.parentId`. Names get the usual numbering when the name is already used.
 * Returns the new scene and the ids of the new top objects.
 */
export function pasteFromClipboard(
  scene: Scene,
  clipboard: ClipboardData,
  generateId: () => string,
  options: PasteOptions,
): { scene: Scene; rootIds: string[] } {
  const offset = options.offset ?? [0, 0, 0];
  const idMap = new Map(clipboard.nodes.map((node) => [node.id, generateId()]));
  let next = clipboard.assets.reduce(addAsset, scene);
  const roots = new Set(clipboard.rootIds);
  const rootIds: string[] = [];
  const parentId =
    options.parentId !== null && next.nodes[options.parentId]
      ? options.parentId
      : null;

  for (const original of clipboard.nodes) {
    const id = idMap.get(original.id)!;
    if (roots.has(original.id)) {
      const transform =
        options.rootTransforms?.[original.id] ?? original.transform;
      const [x, y, z] = transform.position;
      next = addNode(next, {
        ...original,
        id,
        parentId,
        name: availableName(next, original.name),
        transform: {
          ...transform,
          position: [x + offset[0], y + offset[1], z + offset[2]],
        },
      });
      rootIds.push(id);
    } else {
      next = addNode(next, {
        ...original,
        id,
        parentId: idMap.get(original.parentId!) ?? null,
      });
    }
  }
  return { scene: next, rootIds };
}

/**
 * The objects that are marked as cut (shown greyed): the cut objects and everything inside them that
 * still exists. Empty unless the clipboard holds a cut.
 */
export function cutNodeIds(
  scene: Scene,
  clipboard: ClipboardData | null,
): Set<string> {
  if (!clipboard || clipboard.mode !== "cut") return new Set();
  return new Set(
    clipboard.rootIds
      .filter((id) => scene.nodes[id] !== undefined)
      .flatMap((id) => getSubtreeIds(scene, id)),
  );
}

/** The cut objects that can still be moved: they still exist and are not locked (checked again at paste time). */
export function movableCutRoots(
  scene: Scene,
  clipboard: ClipboardData,
): string[] {
  return clipboard.mode === "cut" ? editableIds(scene, clipboard.rootIds) : [];
}

/**
 * Where a paste should go:
 * - "auto": what a plain Paste does (see `resolveAutoPlacement`)
 * - "beside": next to the selected objects, in their parent
 * - "top": the top level
 * - { into }: inside one object
 */
export type PastePlacement = "auto" | "beside" | "top" | { into: string };

/**
 * What a plain Paste means for the current selection:
 * - nothing selected: the top level
 * - exactly one object selected that is NOT part of what was copied or cut: inside it (it becomes the
 *   parent). So "cut A, click B, paste" makes A a child of B.
 * - the selection is (part of) what was copied or cut, or several objects are selected: next to the
 *   selection. So "copy A, paste" puts the copy beside A, not inside A itself.
 */
export function resolveAutoPlacement(
  scene: Scene,
  selectedIds: readonly string[],
  clipboard: ClipboardData,
): "beside" | "top" | { into: string } {
  const selected = selectedIds.filter((id) => scene.nodes[id] !== undefined);
  if (selected.length === 0) return "top";
  const copiedIds = new Set(clipboard.nodes.map((node) => node.id));
  const onlyId = selected[0]!;
  if (selected.length === 1 && !copiedIds.has(onlyId)) return { into: onlyId };
  return "beside";
}

export type PasteTargetResult =
  { ok: true; parentId: string | null } | { ok: false; reason: string };

/**
 * Works out which parent a paste goes into, and whether that is allowed.
 * - "auto": decided from the selection (see `resolveAutoPlacement`).
 * - "beside": next to the selected objects, in their parent (or the top level if nothing is selected
 *   or the selected objects have different parents).
 * - "top": the top level.
 * - { into }: inside that object.
 * Refused: a parent that does not exist or is locked (or inside a locked object), and, for a cut, a
 * parent that is one of the cut objects or inside one (an object cannot go into itself).
 */
export function pasteTarget(
  scene: Scene,
  selectedIds: readonly string[],
  clipboard: ClipboardData,
  placement: PastePlacement,
): PasteTargetResult {
  const resolved =
    placement === "auto"
      ? resolveAutoPlacement(scene, selectedIds, clipboard)
      : placement;
  let parentId: string | null;
  if (resolved === "top") {
    parentId = null;
  } else if (resolved === "beside") {
    const parents = new Set(
      selectedIds.flatMap((id) =>
        scene.nodes[id] ? [scene.nodes[id].parentId] : [],
      ),
    );
    parentId = parents.size === 1 ? [...parents][0]! : null;
  } else {
    parentId = resolved.into;
  }
  if (parentId === null) return { ok: true, parentId: null };

  const parent = scene.nodes[parentId];
  if (!parent) return { ok: false, reason: "That object no longer exists." };
  if (isEffectivelyLocked(scene, parentId)) {
    return {
      ok: false,
      reason: `"${parent.name}" is locked, so nothing can be pasted into it.`,
    };
  }
  if (
    clipboard.mode === "cut" &&
    clipboard.rootIds.some((rootId) => isInSubtree(scene, parentId, rootId))
  ) {
    return {
      ok: false,
      reason:
        "An object cannot be pasted into itself or into something inside it.",
    };
  }
  return { ok: true, parentId };
}
