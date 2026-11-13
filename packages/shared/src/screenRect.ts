/** A rectangle on the screen, in pixels. Used for the drag-a-box selection. */
export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Rectangle between two corner points, whichever way the box was dragged. */
export function rectFromPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Rect {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    right: Math.max(x0, x1),
    bottom: Math.max(y0, y1),
  };
}

/** Smallest rectangle containing all the points, or null if there are none. */
export function boundsOfPoints(
  points: ReadonlyArray<{ x: number; y: number }>,
): Rect | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/** True if the rectangles share any area or touch. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.left <= b.right &&
    a.right >= b.left &&
    a.top <= b.bottom &&
    a.bottom >= b.top
  );
}
