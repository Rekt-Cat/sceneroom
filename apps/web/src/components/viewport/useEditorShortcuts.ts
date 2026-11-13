"use client";

import { useEffect } from "react";
import { modeForKey } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";

/** True when the user is typing in a field, so letter keys must not trigger shortcuts. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
  );
}

/**
 * W / E / R switch the gizmo, X toggles snapping, Escape clears the selection,
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
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const { setTransformMode, toggleSnap, select } = useSceneStore.getState();
      const mode = modeForKey(event.key);
      if (mode) setTransformMode(mode);
      else if (event.key.toLowerCase() === "x") toggleSnap();
      else if (event.key === "Escape") select(null);
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
