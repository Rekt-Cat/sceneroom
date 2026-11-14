import { isEffectivelyLocked, supportsModifiers } from "@sceneroom/shared";
import { bakeNodeToMesh } from "@/mesh/bakeMesh";
import { useEditStore } from "@/store/editStore";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";

function say(text: string) {
  useImportStore.getState().setMessage({ tone: "error", text });
}

/**
 * Enters edit mode for an object. A shape (cube, sphere, ...) is first turned into an editable mesh, so
 * there are points to edit; a mesh with modifiers on it is refused (the points shown would not be the
 * ones that are stored), with a message saying to bake them first. Returns whether edit mode started.
 */
export async function startEditing(nodeId: string): Promise<boolean> {
  const store = useSceneStore.getState();
  const node = store.scene.nodes[nodeId];
  if (!node || !supportsModifiers(node)) {
    say("Only shapes and meshes can be edited point by point.");
    return false;
  }
  if (isEffectivelyLocked(store.scene, nodeId)) {
    say(`"${node.name}" is locked. Unlock it to edit its points.`);
    return false;
  }
  if (node.kind === "mesh" && node.modifiers.some((m) => m.enabled)) {
    say(
      `"${node.name}" has modifiers on it. Press Make mesh first to bake them in, then edit its points.`,
    );
    return false;
  }
  if (node.kind !== "mesh" && !(await bakeNodeToMesh(nodeId))) return false;

  // Edit mode belongs to the one selected object
  const latest = useSceneStore.getState();
  if (latest.selectedIds.length !== 1 || latest.selectedIds[0] !== nodeId) {
    latest.select(nodeId);
  }
  useEditStore.getState().enter(nodeId);
  return true;
}

/** Leaves edit mode. */
export function stopEditing(): void {
  useEditStore.getState().exit();
}

/** Tab: leaves edit mode, or enters it for the single selected object. */
export async function toggleEditMode(): Promise<void> {
  if (useEditStore.getState().nodeId) {
    stopEditing();
    return;
  }
  const { selectedIds } = useSceneStore.getState();
  if (selectedIds.length !== 1) {
    say("Select one shape or mesh first, then press Tab to edit its points.");
    return;
  }
  await startEditing(selectedIds[0]!);
}

/**
 * Edit mode ends by itself when the edited object is no longer the one selected object, or is gone, or
 * is no longer a mesh (for example after Undo). Returns a function that stops watching.
 */
export function watchEditMode(): () => void {
  return useSceneStore.subscribe((state) => {
    const edit = useEditStore.getState();
    if (!edit.nodeId) return;
    const node = state.scene.nodes[edit.nodeId];
    const stillSelected =
      state.selectedIds.length === 1 && state.selectedIds[0] === edit.nodeId;
    if (!node || node.kind !== "mesh" || !stillSelected) edit.exit();
  });
}
