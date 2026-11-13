"use client";

import { useRef, useState, type PointerEvent } from "react";
import { isEffectivelyLocked, movableSelection } from "@sceneroom/shared";
import { useLayoutStore } from "@/store/layoutStore";
import { useSceneStore } from "@/store/sceneStore";
import { moveToParent } from "./reparent";

/** How far (in pixels) the mouse must move before a press on a row turns into a drag. */
const DRAG_START_DISTANCE_PX = 5;

/** The special drop target id for "the top level of the scene". */
export const ROOT_DROP_ID = "root";

/** What is being dragged and where it would land, for drawing the ghost and highlighting the target. */
export type RowDrag = {
  ids: string[];
  label: string;
  x: number;
  y: number;
  /** The `data-drop-id` of the element under the pointer, or null. */
  targetId: string | null;
  /** Whether dropping on that target is allowed (not onto itself or onto something inside it). */
  valid: boolean;
};

/**
 * Dragging rows in the scene list to re-parent them. Drop a row onto another row to make it a child,
 * or onto the "top level" area. Rows and that area mark themselves with a `data-drop-id`.
 *
 * Built with pointer events, not the browser's built-in drag and drop (which does not work reliably
 * on buttons in every browser). Escape cancels. A press that moves less than a few pixels stays a click.
 */
export function useRowDrag() {
  const [drag, setDrag] = useState<RowDrag | null>(null);
  const justDragged = useRef(false);

  function startDrag(
    event: PointerEvent<HTMLElement>,
    nodeId: string,
    nodeName: string,
  ) {
    if (event.button !== 0) return;
    // A locked object cannot be moved, so a press on it stays a plain click
    if (isEffectivelyLocked(useSceneStore.getState().scene, nodeId)) return;
    const startX = event.clientX;
    const startY = event.clientY;
    // Dragging a selected row drags the whole selection; dragging any other row drags only that row
    const { selectedIds } = useSceneStore.getState();
    const ids = selectedIds.includes(nodeId) ? selectedIds : [nodeId];
    const label = ids.length > 1 ? `${ids.length} objects` : nodeName;
    let started = false;

    function targetAt(x: number, y: number): string | null {
      const element = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-drop-id]");
      return element?.dataset.dropId ?? null;
    }

    function isAllowed(targetId: string | null): boolean {
      if (targetId === null) return false;
      const parentId = targetId === ROOT_DROP_ID ? null : targetId;
      const { scene } = useSceneStore.getState();
      return movableSelection(scene, ids, parentId).length > 0;
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      document.body.style.cursor = "";
    }

    function onMove(move: globalThis.PointerEvent) {
      if (!started) {
        const distance = Math.hypot(
          move.clientX - startX,
          move.clientY - startY,
        );
        if (distance < DRAG_START_DISTANCE_PX) return;
        started = true;
        document.body.style.cursor = "grabbing";
      }
      const targetId = targetAt(move.clientX, move.clientY);
      setDrag({
        ids,
        label,
        x: move.clientX,
        y: move.clientY,
        targetId,
        valid: isAllowed(targetId),
      });
    }

    function finish(drop: { x: number; y: number } | null) {
      cleanup();
      if (!started) return;
      // The browser sends a click right after the button is released; the row ignores it
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
      setDrag(null);
      if (!drop) return;
      const targetId = targetAt(drop.x, drop.y);
      if (!isAllowed(targetId)) return;
      const parentId = targetId === ROOT_DROP_ID ? null : targetId;
      if (moveToParent(ids, parentId) && parentId) {
        useLayoutStore.getState().expandNode(parentId);
      }
    }

    function onUp(up: globalThis.PointerEvent) {
      finish({ x: up.clientX, y: up.clientY });
    }
    function onCancel() {
      finish(null);
    }
    // Escape cancels the drag. Handled first, so it does not also clear the selection.
    function onKey(key: KeyboardEvent) {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopImmediatePropagation();
      finish(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  }

  return { drag, startDrag, justDragged };
}
