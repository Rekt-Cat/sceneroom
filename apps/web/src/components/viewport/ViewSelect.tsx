"use client";

import { useEffect, useRef, useState } from "react";
import { VIEW_KINDS, VIEW_LABELS, type ViewKind } from "@sceneroom/shared";
import { Icon } from "./icons";

/**
 * The drop-down in the top-left corner of a view: which side (or the normal 3D view) it shows. Perspective is
 * first, so one choice goes back to the normal view.
 *
 * It is made of plain buttons, not the browser's own <select>: the four views are used while Space is HELD,
 * and a real <select> reads the repeating Space key as "choose the highlighted item and close", so it kept
 * closing and picking whatever was under the pointer. Buttons ignore Space here (the editor takes it).
 */
export default function ViewSelect({
  value,
  onChange,
  label,
}: {
  value: ViewKind;
  onChange: (view: ViewKind) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close when the pointer goes down outside, or Escape is pressed
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="flex h-8 items-center gap-2 rounded-md border border-ed-line-strong bg-ed-raised/95 pr-2 pl-3 text-sm font-medium text-ed-text shadow-md shadow-black/40 hover:bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        {VIEW_LABELS[value]}
        <Icon name="chevronDown" className="size-4 text-ed-text-2" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute top-9 left-0 z-30 min-w-36 rounded-lg border border-ed-line-strong bg-ed-raised p-1 text-sm shadow-xl shadow-black/50"
        >
          {VIEW_KINDS.map((kind) => (
            <li key={kind} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={kind === value}
                onClick={() => {
                  onChange(kind);
                  setOpen(false);
                }}
                className={`flex w-full rounded-md px-3 py-1.5 text-left hover:bg-ed-accent/30 focus-visible:bg-ed-accent/30 focus-visible:outline-none ${
                  kind === value ? "font-semibold text-ed-select" : ""
                }`}
              >
                {VIEW_LABELS[kind]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
