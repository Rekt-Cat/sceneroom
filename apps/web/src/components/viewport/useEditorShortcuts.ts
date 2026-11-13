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

/** W / E / R switch the gizmo, X toggles snapping, Escape clears the selection. */
export function useEditorShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const { setTransformMode, toggleSnap, select } = useSceneStore.getState();
      const mode = modeForKey(event.key);
      if (mode) setTransformMode(mode);
      else if (event.key.toLowerCase() === "x") toggleSnap();
      else if (event.key === "Escape") select(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
