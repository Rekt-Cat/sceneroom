"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PRIMITIVE_KINDS, type PrimitiveKind } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { Icon, KIND_LABELS, KindIcon } from "./icons";

const KIND_HINTS: Record<PrimitiveKind, string> = {
  cube: "Box, 1 × 1 × 1",
  sphere: "Ball, 1 across",
  cylinder: "Round column",
  plane: "Flat sheet, visible from both sides",
  cone: "Pointed top",
};

/** The "Add" button and its pop-up list of shapes. Keys 1 to 5 add a shape without opening it. */
export default function AddMenu() {
  const addPrimitive = useSceneStore((state) => state.addPrimitive);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // While open: put the focus on the first shape, and close when the pointer goes down outside
  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onMenuKeyDown(event: KeyboardEvent) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    }
  }

  function choose(kind: PrimitiveKind) {
    addPrimitive(kind);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 items-center gap-1.5 rounded-md bg-ed-accent pr-2 pl-2.5 text-sm font-medium text-white transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-accent"
      >
        <Icon name="plus" />
        Add
        <Icon name="chevronDown" className="size-3" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Add an object"
          onKeyDown={onMenuKeyDown}
          className="absolute top-9 right-0 z-30 w-64 rounded-xl border border-ed-line-strong bg-ed-raised p-1.5 shadow-2xl shadow-black/50"
        >
          {PRIMITIVE_KINDS.map((kind, index) => (
            <button
              key={kind}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              onClick={() => choose(kind)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-ed-accent/30 focus-visible:bg-ed-accent/30 focus-visible:outline-none"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ed-panel text-ed-text-2">
                <KindIcon kind={kind} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {KIND_LABELS[kind]}
                </span>
                <span className="block truncate text-xs text-ed-text-3">
                  {KIND_HINTS[kind]}
                </span>
              </span>
              <kbd className="rounded border border-ed-line-strong px-1.5 font-mono text-[11px] leading-[17px] text-ed-text-3">
                {index + 1}
              </kbd>
            </button>
          ))}
          <p className="mx-1.5 mt-1.5 mb-1 border-t border-ed-line-strong pt-2 text-[11px] text-ed-text-3">
            New objects appear in the middle of the scene and are selected.
          </p>
        </div>
      )}
    </div>
  );
}
