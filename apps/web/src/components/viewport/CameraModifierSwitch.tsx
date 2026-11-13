"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import {
  clearCameraDragRestarted,
  markCameraDragRestarted,
} from "./gizmoGuard";

/** The part of OrbitControls we use: it announces when a camera drag starts and ends. */
type ControlsEvents = {
  /** The element OrbitControls listens on (R3F's root element, not the canvas). */
  domElement: HTMLElement | null;
  addEventListener(type: "start" | "end", listener: () => void): void;
  removeEventListener(type: "start" | "end", listener: () => void): void;
};

// Only Shift: Ctrl/Cmd + left-drag draws the selection box instead (BoxSelectController)
const MODIFIER_KEYS = new Set(["Shift"]);

/** `PointerEvent.button` (0 left, 1 middle, 2 right) to the `buttons` bit mask. */
const BUTTONS_MASK: Record<number, number> = { 0: 1, 1: 4, 2: 2 };

/**
 * OrbitControls only looks at Shift at the moment the mouse button goes down, so
 * pressing Shift in the middle of a drag changed nothing. This component fixes that: when a
 * Shift is pressed or released during a camera drag, it ends the drag and immediately
 * starts a new one at the same spot with the new modifier state. Pan and rotate then switch live.
 *
 * Renders nothing; it only has to live inside the <Canvas>.
 */
export default function CameraModifierSwitch() {
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as ControlsEvents | null;

  useEffect(() => {
    if (!controls) return;

    let dragging = false;
    let pointer: { id: number; x: number; y: number; button: number } | null =
      null;

    const onStart = () => {
      dragging = true;
    };
    const onEnd = () => {
      dragging = false;
    };
    const rememberPointer = (event: PointerEvent) => {
      // isTrusted is false for the synthetic events we send ourselves
      if (event.isTrusted && event.type === "pointerdown") {
        clearCameraDragRestarted();
      }
      if (event.pointerType === "mouse") {
        // pointermove events carry no "which button started this" info, so keep the one from pointerdown
        const button =
          event.type === "pointerdown" && event.isTrusted
            ? event.button
            : (pointer?.button ?? 0);
        pointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          button,
        };
      }
    };

    function restartDrag(event: KeyboardEvent) {
      if (!MODIFIER_KEYS.has(event.key) || event.repeat) return;
      const target = controls?.domElement;
      if (!dragging || !pointer || !target) return;

      // bubbles: false keeps the events from travelling further up the page. OrbitControls listens
      // on `target` (pointerdown) and on the document (pointerup), so it still receives them.
      const init: PointerEventInit = {
        pointerId: pointer.id,
        pointerType: "mouse",
        button: pointer.button,
        buttons: BUTTONS_MASK[pointer.button] ?? 1,
        clientX: pointer.x,
        clientY: pointer.y,
        shiftKey: event.shiftKey,
        bubbles: false,
      };
      markCameraDragRestarted();
      target.ownerDocument.dispatchEvent(new PointerEvent("pointerup", init));
      target.dispatchEvent(new PointerEvent("pointerdown", init));
    }

    controls.addEventListener("start", onStart);
    controls.addEventListener("end", onEnd);
    window.addEventListener("pointerdown", rememberPointer, true);
    window.addEventListener("pointermove", rememberPointer, true);
    window.addEventListener("keydown", restartDrag);
    window.addEventListener("keyup", restartDrag);
    return () => {
      controls.removeEventListener("start", onStart);
      controls.removeEventListener("end", onEnd);
      window.removeEventListener("pointerdown", rememberPointer, true);
      window.removeEventListener("pointermove", rememberPointer, true);
      window.removeEventListener("keydown", restartDrag);
      window.removeEventListener("keyup", restartDrag);
    };
  }, [controls]);

  return null;
}
