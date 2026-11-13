"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { LEFT_PANEL_LIMITS, RIGHT_PANEL_LIMITS } from "@sceneroom/shared";
import { useLayoutStore } from "@/store/layoutStore";

/** Pixels moved by one arrow-key press (Shift: four times as much). */
const KEY_STEP_PX = 16;

/**
 * A thin handle on the inner edge of a side panel. Drag it to change the panel's width, double-click
 * to go back to the starting width, or focus it and use the left and right arrow keys.
 */
export default function PanelResizer({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";
  const limits = isLeft ? LEFT_PANEL_LIMITS : RIGHT_PANEL_LIMITS;
  const width = useLayoutStore((s) => (isLeft ? s.leftWidth : s.rightWidth));
  const setWidth = useLayoutStore((s) =>
    isLeft ? s.setLeftWidth : s.setRightWidth,
  );
  const resetWidth = useLayoutStore((s) =>
    isLeft ? s.resetLeftWidth : s.resetRightWidth,
  );
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  // The left panel grows when the handle moves right; the right panel grows when it moves left
  const direction = isLeft ? 1 : -1;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    document.body.style.cursor = "col-resize";
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const moved = (event.clientX - drag.current.startX) * direction;
    setWidth(drag.current.startWidth + moved);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    document.body.style.cursor = "";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = KEY_STEP_PX * (event.shiftKey ? 4 : 1);
    const towardsRight = event.key === "ArrowRight" ? 1 : -1;
    setWidth(width + step * towardsRight * direction);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${isLeft ? "scene" : "inspector"} panel`}
      aria-valuenow={width}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={resetWidth}
      onKeyDown={onKeyDown}
      className={`group absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none outline-none ${
        isLeft ? "-right-1" : "-left-1"
      }`}
    >
      {/* The visible line: hidden until the handle is hovered, dragged or focused */}
      <span className="absolute inset-y-0 left-[3px] w-0.5 bg-transparent transition-colors group-hover:bg-ed-accent/70 group-focus-visible:bg-ed-accent group-active:bg-ed-accent" />
    </div>
  );
}
