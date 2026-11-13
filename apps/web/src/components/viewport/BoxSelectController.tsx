"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Mesh, Vector3 } from "three";
import {
  boundsOfPoints,
  isEffectivelyVisible,
  rectFromPoints,
  rectsOverlap,
  type Rect,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { useBoxSelectStore } from "./boxSelectStore";
import { getMesh } from "./meshRegistry";

/** A drag shorter than this (in pixels) is a click, not a box. */
const MIN_BOX_SIZE_PX = 4;

/** Switchable part of the camera controls: while a box is dragged, the camera must stay put. */
type SwitchableControls = { enabled: boolean };

/**
 * Hold Ctrl (Windows) or Cmd (Mac) and drag with the left button to draw a selection box. Every
 * object whose outline touches the box is selected. Hold Shift when you let go to add to the
 * current selection instead of replacing it.
 *
 * Renders nothing; it only has to live inside the <Canvas> (it needs the camera).
 */
export default function BoxSelectController() {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as SwitchableControls | null;

  useEffect(() => {
    let start: { x: number; y: number } | null = null;

    /** Where an object's bounding box lands on the screen, as a rectangle (null if behind the camera). */
    function screenBoundsOf(id: string): Rect | null {
      const object = getMesh(id);
      if (!object) return null;
      // Only this mesh's own shape: setFromObject would also include the objects inside it
      if (!(object instanceof Mesh)) return null;
      object.updateWorldMatrix(true, false);
      object.geometry.computeBoundingBox();
      if (!object.geometry.boundingBox) return null;
      const box = object.geometry.boundingBox
        .clone()
        .applyMatrix4(object.matrixWorld);
      if (box.isEmpty()) return null;
      const bounds = canvas.getBoundingClientRect();
      const corners: { x: number; y: number }[] = [];
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const point = new Vector3(x, y, z).project(camera);
            if (point.z > 1) continue; // behind the camera
            corners.push({
              x: bounds.left + (point.x * 0.5 + 0.5) * bounds.width,
              y: bounds.top + (-point.y * 0.5 + 0.5) * bounds.height,
            });
          }
        }
      }
      return boundsOfPoints(corners);
    }

    function finish() {
      start = null;
      useBoxSelectStore.getState().setRect(null);
      if (controls) controls.enabled = true;
    }

    // Capture phase on window: runs before OrbitControls sees the press, so we can switch it off first
    function onPointerDown(event: PointerEvent) {
      if (!event.isTrusted || event.button !== 0) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      // Only presses on the 3D view itself (not on the toolbars drawn over it)
      if (event.target !== canvas) return;
      start = { x: event.clientX, y: event.clientY };
      if (controls) controls.enabled = false;
    }

    function onPointerMove(event: PointerEvent) {
      if (!start) return;
      useBoxSelectStore
        .getState()
        .setRect(
          rectFromPoints(start.x, start.y, event.clientX, event.clientY),
        );
    }

    function onPointerUp(event: PointerEvent) {
      if (!start) return;
      const box = rectFromPoints(
        start.x,
        start.y,
        event.clientX,
        event.clientY,
      );
      const bigEnough =
        box.right - box.left >= MIN_BOX_SIZE_PX ||
        box.bottom - box.top >= MIN_BOX_SIZE_PX;
      finish();
      if (!bigEnough) return; // a plain click: the normal click handling takes over

      const { scene, selectedIds, setSelection } = useSceneStore.getState();
      const hit = Object.values(scene.nodes)
        .filter((node) => isEffectivelyVisible(scene, node.id))
        .filter((node) => {
          const bounds = screenBoundsOf(node.id);
          return bounds !== null && rectsOverlap(bounds, box);
        })
        .map((node) => node.id);
      setSelection(event.shiftKey ? [...selectedIds, ...hit] : hit);
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      finish();
    };
  }, [camera, canvas, controls]);

  return null;
}
