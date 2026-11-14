import {
  movableCutRoots,
  pasteTarget,
  type PastePlacement,
  type Transform,
} from "@sceneroom/shared";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { getMesh } from "./meshRegistry";
import { moveToParent } from "./reparent";
import { localTransformUnder } from "./worldTransform";

/** Shows a short message in the bar over the 3D view. */
function tell(text: string): void {
  useImportStore.getState().setMessage({ tone: "error", text });
}

/**
 * Pastes what was copied or cut.
 * - A COPY becomes new objects in the chosen place; if that is a different parent than the original's,
 *   each copy keeps its place in the 3D view (like moving an object between parents does).
 * - A CUT MOVES the cut objects (they keep their identity) to the chosen place, keeping their place in
 *   the 3D view; the greying stops and the clipboard is emptied, since they are not in the old place any more.
 * Returns true if something was pasted; otherwise explains why in the message bar.
 */
export function pasteClipboard(placement: PastePlacement): boolean {
  const store = useSceneStore.getState();
  const clipboard = store.clipboard;
  if (!clipboard) return false;

  const target = pasteTarget(
    store.scene,
    store.selectedIds,
    clipboard,
    placement,
  );
  if (!target.ok) {
    tell(target.reason);
    return false;
  }

  if (clipboard.mode === "cut") {
    const ids = movableCutRoots(store.scene, clipboard);
    if (ids.length === 0) {
      tell(
        "The cut objects are gone or locked now, so there is nothing to paste.",
      );
      store.clearClipboard();
      return false;
    }
    if (!moveToParent(ids, target.parentId, "Paste")) {
      tell("The cut objects could not be moved there.");
      return false;
    }
    store.clearClipboard();
    store.setSelection(ids);
    return true;
  }

  // A copy: keep each top copy where the original is in the 3D view, if it goes into a different parent
  const parentObject = target.parentId
    ? (getMesh(target.parentId) ?? null)
    : null;
  const rootTransforms: Record<string, Transform> = {};
  for (const rootId of clipboard.rootIds) {
    const original = clipboard.nodes.find((node) => node.id === rootId);
    const originalObject = getMesh(rootId); // only there if the original is still in the scene
    const differentParent = original && original.parentId !== target.parentId;
    const parentReady = target.parentId === null || parentObject !== null;
    if (differentParent && originalObject && parentReady) {
      rootTransforms[rootId] = localTransformUnder(
        originalObject,
        parentObject,
      );
    }
  }
  store.pasteCopies(target.parentId, rootTransforms);
  return true;
}
