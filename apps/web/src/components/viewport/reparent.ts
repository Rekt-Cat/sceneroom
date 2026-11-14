import { movableSelection, type ReparentMove } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { getMesh } from "./meshRegistry";
import { localTransformUnder } from "./worldTransform";

/**
 * Moves objects under a new parent (null = top level) and keeps them where they are in the 3D view.
 * Only the top objects of `ids` move; their children go along. Returns false if nothing moved
 * (for example because the move would make a loop).
 */
export function moveToParent(
  ids: readonly string[],
  parentId: string | null,
  /** The name of the undo step. Defaults to "Move into <parent>" or "Move to top level". */
  label?: string,
  /** Where among the new parent's children: before this object, or at the end if null. Left out: keep the place if the parent stays, else the end. */
  beforeId?: string | null,
): boolean {
  const { scene, reparentNodes } = useSceneStore.getState();
  const movable = movableSelection(scene, ids, parentId);
  if (movable.length === 0) return false;

  const parentObject = parentId ? (getMesh(parentId) ?? null) : null;
  if (parentId && !parentObject) return false;

  const moves: ReparentMove[] = [];
  for (const id of movable) {
    const object = getMesh(id);
    if (!object) return false;
    // Staying in the same parent (only changing the place): the transform does not change, so keep it as it is
    const sameParent = scene.nodes[id]?.parentId === parentId;
    moves.push({
      id,
      parentId,
      transform: sameParent
        ? scene.nodes[id]!.transform
        : localTransformUnder(object, parentObject),
      beforeId,
    });
  }

  const parentName = parentId ? scene.nodes[parentId]?.name : undefined;
  reparentNodes(
    moves,
    label ?? (parentName ? `Move into ${parentName}` : "Move to top level"),
  );
  return true;
}
