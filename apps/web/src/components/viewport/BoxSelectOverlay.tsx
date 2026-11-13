"use client";

import { useBoxSelectStore } from "./boxSelectStore";

/** Draws the rectangle while you drag a selection box. It never catches the mouse itself. */
export default function BoxSelectOverlay() {
  const rect = useBoxSelectStore((state) => state.rect);
  if (!rect) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed border border-sky-400 bg-sky-400/15"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      }}
    />
  );
}
