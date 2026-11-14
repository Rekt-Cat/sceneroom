"use client";

import { useRef, useState, type PointerEvent } from "react";
import {
  dropPlacement,
  isEffectivelyLocked,
  movableSelection,
  topLevelSelection,
  type DropPlacement,
  type DropZone,
} from "@sceneroom/shared";
import { useLayoutStore } from "@/store/layoutStore";
import { useSceneStore } from "@/store/sceneStore";
import { moveToParent } from "./reparent";

/** How far (in pixels) the mouse must move before a press on a row turns into a drag. */
const DRAG_START_DISTANCE_PX = 5;

/**
 * How much of the top and of the bottom of a row counts as "just before" and "just after" it (as a
 * fraction of the row's height). The middle of a row means "inside it".
 */
const EDGE_ZONE_FRACTION = 0.25;

/** While dragging, the list scrolls by itself when the pointer is within this many pixels of its top or bottom edge. */
const AUTO_SCROLL_EDGE_PX = 48;

/** The fastest the list scrolls by itself, in pixels per animation frame (reached at the very edge). */
const AUTO_SCROLL_MAX_SPEED_PX = 18;

/** Marks the scrolling list, so the drag can find it. */
export const SCROLL_LIST_ATTRIBUTE = "data-scroll-list";

/** The special drop target id for "the top level of the scene". */
export const ROOT_DROP_ID = "root";

/** The part of the list under the pointer, and the place in the tree dropping there would give. */
export type DropTarget = {
  /** The row's object id, or ROOT_DROP_ID for the top-level areas. */
  id: string;
  zone: DropZone | "root";
  /** Where the dragged rows would end up. */
  placement: DropPlacement;
  /** Whether dropping here is allowed (not into itself, not into a locked object, not a no-op next to itself). */
  valid: boolean;
};

/** What is being dragged and where it would land, for drawing the ghost and the drop line. */
export type RowDrag = {
  ids: string[];
  label: string;
  x: number;
  y: number;
  target: DropTarget | null;
};

/**
 * Dragging rows in the scene list to re-parent and reorder them. The middle of a row means "inside it", the
 * top edge "just before it", the bottom edge "just after it" (or, on an open parent, "as its first child",
 * the place right under it). A bar at the top of the list while dragging, and the empty space under the
 * rows, mean "the top level". Rows and those areas mark themselves with a `data-drop-id`.
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
    const { scene: current, selectedIds } = useSceneStore.getState();
    // A selected row that sits inside another selected row would only move together with it (the move
    // acts on the top objects of a selection), so dragging such a row moves just that row.
    const draggedWithSelection = topLevelSelection(
      current,
      selectedIds,
    ).includes(nodeId);
    const ids = draggedWithSelection ? selectedIds : [nodeId];
    const label = ids.length > 1 ? `${ids.length} objects` : nodeName;
    let started = false;
    // Last pointer position, and the animation frame that scrolls the list while the pointer is at its edge
    let lastX = startX;
    let lastY = startY;
    let scrollFrame = 0;

    /** Whether the dragged rows may go to this place. */
    function isAllowed(
      placement: DropPlacement,
      rowId: string | null,
    ): boolean {
      // Dropping a row just before or after itself changes nothing, so it is not offered
      if (rowId !== null && ids.includes(rowId)) return false;
      const { scene } = useSceneStore.getState();
      return movableSelection(scene, ids, placement.parentId).length > 0;
    }

    /** What is under the pointer: which part of which row (or a top-level area), and what dropping there would do. */
    function targetAt(x: number, y: number): DropTarget | null {
      const element = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-drop-id]");
      const id = element?.dataset.dropId;
      if (!element || !id) return null;

      if (id === ROOT_DROP_ID) {
        const placement = { parentId: null, beforeId: null };
        return {
          id,
          zone: "root",
          placement,
          valid: isAllowed(placement, null),
        };
      }

      const rect = element.getBoundingClientRect();
      const fraction = rect.height > 0 ? (y - rect.top) / rect.height : 0.5;
      const zone: DropZone =
        fraction < EDGE_ZONE_FRACTION
          ? "before"
          : fraction > 1 - EDGE_ZONE_FRACTION
            ? "after"
            : "into";
      const open = !useLayoutStore.getState().collapsedIds.has(id);
      const { scene } = useSceneStore.getState();
      const placement = dropPlacement(scene, id, zone, open);
      if (!placement) return null;
      // "into" a row is checked against the row itself (moving a row into itself is refused by the move rule)
      const rowForNoOpCheck = zone === "into" ? null : id;
      return {
        id,
        zone,
        placement,
        valid: isAllowed(placement, rowForNoOpCheck),
      };
    }

    /** Scrolls the list while the pointer is near its top or bottom edge, then looks again (also updates the drop target). */
    function autoScroll() {
      scrollFrame = 0;
      const list = document.querySelector<HTMLElement>(
        `[${SCROLL_LIST_ATTRIBUTE}]`,
      );
      if (!list) return;
      const rect = list.getBoundingClientRect();
      let speed = 0;
      if (lastY < rect.top + AUTO_SCROLL_EDGE_PX) {
        const depth =
          (rect.top + AUTO_SCROLL_EDGE_PX - lastY) / AUTO_SCROLL_EDGE_PX;
        speed = -AUTO_SCROLL_MAX_SPEED_PX * Math.min(depth, 1);
      } else if (lastY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
        const depth =
          (lastY - (rect.bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX;
        speed = AUTO_SCROLL_MAX_SPEED_PX * Math.min(depth, 1);
      }
      if (speed === 0) return;
      const before = list.scrollTop;
      list.scrollTop += speed;
      if (list.scrollTop !== before) {
        // The rows moved under a still pointer, so the drop target may have changed
        setDrag((current) =>
          current ? { ...current, target: targetAt(lastX, lastY) } : current,
        );
      }
      scrollFrame = requestAnimationFrame(autoScroll);
    }

    function cleanup() {
      cancelAnimationFrame(scrollFrame);
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
      lastX = move.clientX;
      lastY = move.clientY;
      if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
      setDrag({
        ids,
        label,
        x: move.clientX,
        y: move.clientY,
        target: targetAt(move.clientX, move.clientY),
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
      const target = targetAt(drop.x, drop.y);
      if (!target || !target.valid) return;
      const { parentId, beforeId } = target.placement;
      // Staying in the same parent and only changing the place is a reorder
      const { scene } = useSceneStore.getState();
      const reorder = ids.every((id) => scene.nodes[id]?.parentId === parentId);
      if (
        moveToParent(ids, parentId, reorder ? "Reorder" : undefined, beforeId)
      ) {
        // Make sure the moved rows can be seen: open the parent they went into
        if (parentId) useLayoutStore.getState().expandNode(parentId);
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
