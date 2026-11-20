"use client";

import { useEffect } from "react";
import { PRIMITIVE_KINDS, modeForKey } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { SEARCH_INPUT_ID } from "./HierarchyPanel";
import {
  deleteSelectedPoints,
  CREASE_SHARP,
  creaseSelectedEdges,
  extrudeSelectedFaces,
  bevelSelectedEdges,
  insetSelectedFaces,
} from "@/meshEdit/editOperations";
import { hideOthers, hideSelection, showAll } from "@/meshEdit/hideShow";
import { selectLess, selectMore } from "@/meshEdit/selectionTools";
import { stopEditing, toggleEditMode } from "@/meshEdit/startEditing";
import { saveProjectToFile } from "@/sceneFile/sceneFileActions";
import { useEditStore, type SelectMode } from "@/store/editStore";
import { useViewStore } from "@/store/viewStore";
import { pasteClipboard } from "./clipboardActions";
import { selectAllPoints } from "./MeshEditor";

/** True when the user is typing in a field, so letter keys must not trigger shortcuts. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
  );
}

/**
 * W / E / R switch the gizmo, X toggles snapping, Escape clears the selection,
 * Delete or Backspace deletes the selected object, Ctrl/Cmd + D duplicates it,
 * Ctrl/Cmd + C copies, + X cuts (marks) and + V pastes beside the selection (Shift + V: inside it),
 * Ctrl/Cmd + Z undoes and Ctrl/Cmd + Shift + Z (or Ctrl + Y) redoes,
 * 1 to 5 add a shape, "/" focuses the search box, L locks or unlocks the selection,
 * and holding Shift flips snapping while it is held.
 */
/** The selection mode a number key chooses in edit mode: 1 points, 2 edges, 3 faces. */
function selectModeForKey(key: string): SelectMode | null {
  return key === "1"
    ? "point"
    : key === "2"
      ? "edge"
      : key === "3"
        ? "face"
        : null;
}

export function useEditorShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Shift") {
        useSceneStore.getState().setSnapKeyHeld(true);
        return;
      }
      if (isTypingTarget(event.target)) return;

      // Holding the right mouse button in the 3D view: W A S D Q E fly the camera (see FlyController), so they
      // must not do their usual jobs
      if (useViewStore.getState().flying && /^Key[WASDQE]$/.test(event.code)) {
        return;
      }

      const store = useSceneStore.getState();

      // Tab enters edit mode for the selected shape or mesh, and leaves it again
      if (
        event.key === "Tab" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        void toggleEditMode();
        return;
      }

      // Ctrl/Cmd + Z undoes, Ctrl/Cmd + Shift + Z or Ctrl + Y redoes
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) store.redo();
          else store.undo();
          return;
        }
        if (key === "y" && event.ctrlKey) {
          event.preventDefault();
          store.redo();
          return;
        }
        // Ctrl/Cmd + S saves the scene as a file (the browser would otherwise offer to save the web page)
        if (key === "s" && !event.shiftKey) {
          event.preventDefault();
          void saveProjectToFile();
          return;
        }
        // Editing points: copy, cut, paste and duplicate act on whole objects, so they are off
        if (
          useEditStore.getState().nodeId &&
          ["c", "x", "v", "d"].includes(key)
        ) {
          event.preventDefault();
          return;
        }
        // Ctrl/Cmd + C copies, X cuts, V pastes the selected objects. Only when there is something to
        // copy or paste, and not when text on the page is selected (then the browser's own copy applies).
        const textIsSelected = (window.getSelection()?.toString() ?? "") !== "";
        if (
          !event.shiftKey &&
          !textIsSelected &&
          store.selectedIds.length > 0
        ) {
          if (key === "c") {
            event.preventDefault();
            store.copySelected();
            return;
          }
          if (key === "x") {
            event.preventDefault();
            store.cutSelected();
            return;
          }
        }
        if (key === "v" && store.clipboard) {
          event.preventDefault();
          if (event.shiftKey) {
            // Ctrl/Cmd + Shift + V: next to the selected object instead of inside it
            pasteClipboard("beside");
          } else {
            // Ctrl/Cmd + V: inside the single selected object (it becomes the parent), else see resolveAutoPlacement
            pasteClipboard("auto");
          }
          return;
        }
      }

      // Editing points: the keys that act on whole objects (delete, duplicate, copy, add, lock ...) must not
      // do that now. Only these work: Escape leaves, A selects every point.
      if (useEditStore.getState().nodeId) {
        const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
        if (event.key === "Escape") {
          event.preventDefault();
          // Escape first cancels the Loop cut tool; with it off, it leaves edit mode
          const edit = useEditStore.getState();
          if (edit.loopCutMode) edit.setLoopCutMode(false);
          else stopEditing();
        } else if (plain && event.key.toLowerCase() === "a") {
          event.preventDefault();
          selectAllPoints();
        } else if (event.key === "Delete" || event.key === "Backspace") {
          // Delete the selected POINTS (never the object being edited)
          event.preventDefault();
          void deleteSelectedPoints();
        } else if (event.shiftKey && event.key.toLowerCase() === "e") {
          event.preventDefault();
          void extrudeSelectedFaces();
        } else if (plain && modeForKey(event.key)) {
          // W, E, R: move, turn or scale the selected points
          store.setTransformMode(modeForKey(event.key)!);
        } else if (
          event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.code === "KeyH"
        ) {
          // Alt + H: show everything that was hidden
          event.preventDefault();
          showAll();
        } else if (
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          event.code === "KeyH"
        ) {
          // H: hide the selected parts; Shift + H: hide everything else
          event.preventDefault();
          void (event.shiftKey ? hideOthers() : hideSelection());
        } else if (plain && event.key === "]") {
          // ]: select more
          event.preventDefault();
          selectMore();
        } else if (plain && event.key === "[") {
          // [: select less
          event.preventDefault();
          selectLess();
        } else if (plain && event.key.toLowerCase() === "x") {
          store.toggleSnap();
        } else if (
          event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.code === "KeyZ"
        ) {
          // Alt + Z: X-ray, see (and pick) the points on the far side too
          event.preventDefault();
          const edit = useEditStore.getState();
          edit.setXray(!edit.xray);
        } else if (
          event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          event.key.toLowerCase() === "c"
        ) {
          // Shift + C: crease the selected edges (sharp)
          event.preventDefault();
          void creaseSelectedEdges(CREASE_SHARP);
        } else if (plain && event.key.toLowerCase() === "b") {
          // B: bevel the selected edges
          event.preventDefault();
          void bevelSelectedEdges();
        } else if (plain && event.key.toLowerCase() === "i") {
          // I: inset the selected faces
          event.preventDefault();
          void insetSelectedFaces();
        } else if (
          plain &&
          !event.shiftKey &&
          event.key.toLowerCase() === "c"
        ) {
          // C: the Loop cut tool on or off
          event.preventDefault();
          const edit = useEditStore.getState();
          edit.setLoopCutMode(!edit.loopCutMode);
        } else if (plain && selectModeForKey(event.key)) {
          // 1, 2, 3: pick points, edges or faces
          useEditStore.getState().setSelectMode(selectModeForKey(event.key)!);
        }
        return;
      }

      // Ctrl/Cmd + D: the browser would otherwise bookmark the page
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        store.duplicateSelected();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        store.deleteSelected();
        return;
      }
      // 1 to 5 add a shape (same order as the Add menu)
      const kind = /^[1-5]$/.test(event.key)
        ? PRIMITIVE_KINDS[Number(event.key) - 1]
        : undefined;
      if (kind) {
        store.addPrimitive(kind);
        return;
      }
      // F: zoom to the selected objects (as in Blender, Maya and Unity)
      if (event.key.toLowerCase() === "f" && store.selectedIds.length > 0) {
        event.preventDefault();
        useViewStore.getState().requestFocus(store.selectedIds);
        return;
      }
      // "/" jumps to the search box
      if (event.key === "/") {
        event.preventDefault();
        document.getElementById(SEARCH_INPUT_ID)?.focus();
        return;
      }
      // L locks the selection, or unlocks it if everything selected is already locked
      if (event.key.toLowerCase() === "l") {
        const { selectedIds, scene } = store;
        if (selectedIds.length > 0) {
          const allLocked = selectedIds.every((id) => scene.nodes[id]?.locked);
          store.setNodesLocked(selectedIds, !allLocked);
        }
        return;
      }
      const mode = modeForKey(event.key);
      if (mode) store.setTransformMode(mode);
      else if (event.key.toLowerCase() === "x") store.toggleSnap();
      else if (event.key === "Escape") {
        store.select(null);
        // Escape also cancels a cut that has not been pasted yet (the objects stop being greyed)
        if (store.clipboard?.mode === "cut") store.clearClipboard();
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key === "Shift") useSceneStore.getState().setSnapKeyHeld(false);
    }

    // If the window loses focus while Shift is down, keyUp never arrives
    function onBlur() {
      useSceneStore.getState().setSnapKeyHeld(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
