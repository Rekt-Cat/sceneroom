"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2, type Object3D } from "three";
import { isEffectivelyLocked, isEffectivelyVisible } from "@sceneroom/shared";
import { useContextMenuStore } from "@/store/contextMenuStore";
import { useSceneStore } from "@/store/sceneStore";
import { getRegisteredObjects } from "./meshRegistry";

/** A right-button press that moves more than this (pixels) is a camera rotate, not a click. */
const CLICK_MOVE_LIMIT_PX = 4;

/**
 * Opens the right-click menu when you right-click an object in the 3D view. The right button also
 * rotates the camera (drag), so the menu opens when the button is RELEASED without having moved;
 * some systems send the browser's own "context menu" event on press, which cannot tell a click from
 * the start of a drag, so that event is only cancelled.
 *
 * Which object is under the pointer is found with a ray from the camera. Hidden and locked objects
 * are skipped, like for left clicks, so the click goes to whatever is behind them.
 *
 * Renders nothing; it only has to live inside the <Canvas> (it needs the camera).
 */
export default function ViewportContextMenuController() {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);

  useEffect(() => {
    const raycaster = new Raycaster();
    let pressedAt: { x: number; y: number } | null = null;

    function nodeIdAt(clientX: number, clientY: number): string | null {
      const area = canvas.getBoundingClientRect();
      const pointer = new Vector2(
        ((clientX - area.left) / area.width) * 2 - 1,
        -((clientY - area.top) / area.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const { scene } = useSceneStore.getState();
      for (const hit of raycaster.intersectObjects(
        getRegisteredObjects(),
        true,
      )) {
        // The hit may be a part inside a model: walk up to the object that stands for a scene node
        let object: Object3D | null = hit.object;
        while (object && object.userData.nodeId === undefined)
          object = object.parent;
        const id = object?.userData.nodeId as string | undefined;
        if (
          id &&
          isEffectivelyVisible(scene, id) &&
          !isEffectivelyLocked(scene, id)
        ) {
          return id;
        }
      }
      return null;
    }

    function onPointerDown(event: PointerEvent) {
      if (!event.isTrusted || event.button !== 2 || event.target !== canvas)
        return;
      pressedAt = { x: event.clientX, y: event.clientY };
    }

    function onPointerUp(event: PointerEvent) {
      if (event.button !== 2 || !pressedAt) return;
      const moved = Math.hypot(
        event.clientX - pressedAt.x,
        event.clientY - pressedAt.y,
      );
      pressedAt = null;
      if (moved > CLICK_MOVE_LIMIT_PX) return;

      const store = useSceneStore.getState();
      const id = nodeIdAt(event.clientX, event.clientY);
      const menu = useContextMenuStore.getState();
      if (id) {
        // Right-clicking something outside the selection selects it first; inside the selection keeps it
        if (!store.selectedIds.includes(id)) store.select(id);
        menu.open(event.clientX, event.clientY, "object");
      } else if (store.clipboard) {
        menu.open(event.clientX, event.clientY, "empty");
      }
    }

    function onContextMenu(event: MouseEvent) {
      if (event.target === canvas) event.preventDefault();
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [camera, canvas]);

  return null;
}
