"use client";

import { useEffect } from "react";
import { PRIMITIVE_KINDS, modeForKey } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { SEARCH_INPUT_ID } from "./HierarchyPanel";
import { pasteClipboard } from "./clipboardActions";

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
export function useEditorShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Shift") {
        useSceneStore.getState().setSnapKeyHeld(true);
        return;
      }
      if (isTypingTarget(event.target)) return;

      const store = useSceneStore.getState();

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
