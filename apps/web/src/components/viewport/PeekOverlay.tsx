"use client";

import { useEffect, useRef, useState } from "react";
import { peekTileRects, tileAtPoint } from "@sceneroom/shared";
import { useViewStore } from "@/store/viewStore";
import { lastPointer } from "./peekPointer";
import ViewSelect from "./ViewSelect";

/**
 * The frames and drop-downs over the four views while Space is held (the pictures themselves are drawn by
 * PeekRenderer). Each tile has a drop-down in its top-left corner to choose what it shows. It covers the 3D
 * view, so clicks do not reach the scene while the four views are up, and it tells the store which tile the
 * pointer is over (the one that opens big when Space is let go).
 */
export default function PeekOverlay() {
  const active = useViewStore((state) => state.peekActive);
  if (!active) return null;
  return <Tiles />;
}

function Tiles() {
  const tiles = useViewStore((state) => state.peekTiles);
  const hover = useViewStore((state) => state.peekHover);
  const setPeekTile = useViewStore((state) => state.setPeekTile);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Measure the view, and work out which tile the pointer is over (also at once, from where it already was)
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const box = element.getBoundingClientRect();
      setSize({ width: box.width, height: box.height });
    };
    update();
    const hoverAt = (x: number, y: number) => {
      const box = element.getBoundingClientRect();
      const inside =
        x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      useViewStore
        .getState()
        .setPeekHover(
          inside
            ? tileAtPoint(
                peekTileRects(box.width, box.height),
                x - box.left,
                y - box.top,
              )
            : -1,
        );
    };
    hoverAt(lastPointer.x, lastPointer.y);
    const onMove = (event: PointerEvent) =>
      hoverAt(event.clientX, event.clientY);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("pointermove", onMove);
    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const rects = peekTileRects(size.width, size.height);
  return (
    <div
      ref={ref}
      role="group"
      aria-label="Four views: let go of Space over the one to open"
      className="absolute inset-0 z-20"
    >
      {rects.map((rect, i) => (
        <div
          key={i}
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
          }}
          className={`pointer-events-none absolute rounded-md border-2 ${
            hover === i ? "border-ed-accent" : "border-ed-line-strong/70"
          }`}
        >
          <div
            className={`pointer-events-auto absolute top-1.5 ${
              // The FPS counter sits in the top-left corner of the view: the first tile's drop-down goes beside it
              i === 0 ? "left-24" : "left-1.5"
            }`}
          >
            <ViewSelect
              label={`View in the ${["top left", "top right", "bottom left", "bottom right"][i]} tile`}
              value={tiles[i] ?? "perspective"}
              onChange={(view) => setPeekTile(i, view)}
            />
          </div>
        </div>
      ))}
      <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-ed-raised/90 px-3 py-1 text-xs text-ed-text-2">
        Let go of Space over a view to open it big
      </p>
    </div>
  );
}
