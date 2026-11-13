"use client";

import { useEffect } from "react";
import { PRIMITIVE_KINDS, modeForKey } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { SEARCH_INPUT_ID } from "./HierarchyPanel";

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
 * 1 to 5 add a shape, "/" focuses the search box,
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
      const mode = modeForKey(event.key);
      if (mode) store.setTransformMode(mode);
      else if (event.key.toLowerCase() === "x") store.toggleSnap();
      else if (event.key === "Escape") store.select(null);
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
