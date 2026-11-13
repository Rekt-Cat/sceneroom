"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/** The part of OrbitControls we use: it announces when a camera drag starts and ends. */
type ControlsEvents = {
  addEventListener(type: "start" | "end", listener: () => void): void;
  removeEventListener(type: "start" | "end", listener: () => void): void;
};

const MODIFIER_KEYS = new Set(["Shift", "Control", "Meta"]);

/**
 * OrbitControls only looks at Shift (or Ctrl/Cmd) at the moment the mouse button goes down, so
 * pressing Shift in the middle of a drag changed nothing. This component fixes that: when a
 * modifier key is pressed or released during a camera drag, it ends the drag and immediately
 * starts a new one at the same spot with the new modifier state. Pan and rotate then switch live.
 *
 * Renders nothing; it only has to live inside the <Canvas>.
 */
export default function CameraModifierSwitch() {
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as ControlsEvents | null;
  const canvas = useThree((state) => state.gl.domElement);

  useEffect(() => {
    if (!controls) return;

    let dragging = false;
    let pointer: { id: number; x: number; y: number } | null = null;

    const onStart = () => {
      dragging = true;
    };
    const onEnd = () => {
      dragging = false;
    };
    const rememberPointer = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }
    };

    function restartDrag(event: KeyboardEvent) {
      if (!MODIFIER_KEYS.has(event.key) || event.repeat) return;
      if (!dragging || !pointer) return;

      // bubbles: false keeps these synthetic events away from other listeners (such as R3F's click
      // handling); OrbitControls listens on the canvas and the document themselves, so it still gets them
      const init: PointerEventInit = {
        pointerId: pointer.id,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX: pointer.x,
        clientY: pointer.y,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        bubbles: false,
      };
      canvas.ownerDocument.dispatchEvent(new PointerEvent("pointerup", init));
      canvas.dispatchEvent(new PointerEvent("pointerdown", init));
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
  }, [controls, canvas]);

  return null;
}
