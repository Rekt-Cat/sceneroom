"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  LIGHT_KINDS,
  PLANT_PRESET_INFO,
  PLANT_PRESET_NAMES,
  PRIMITIVE_KINDS,
  type LightKind,
  type PlantPresetName,
  type PrimitiveKind,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { Icon, KIND_LABELS, KindIcon } from "./icons";

/** Everything the menu can add. */
type MenuKind = PrimitiveKind | LightKind | PlantPresetName;

const KIND_HINTS: Record<MenuKind, string> = {
  cube: "Box, 1 × 1 × 1",
  sphere: "Ball, 1 across",
  cylinder: "Round column",
  plane: "Flat sheet, visible from both sides",
  cone: "Pointed top",
  directional: "Sunlight: same everywhere, shines along its arrow",
  point: "A bulb: shines in all directions",
  spot: "A torch: a cone of light",
  tree: PLANT_PRESET_INFO.tree.hint,
  pine: PLANT_PRESET_INFO.pine.hint,
  bush: PLANT_PRESET_INFO.bush.hint,
};

function isPlantPreset(kind: MenuKind): kind is PlantPresetName {
  return (PLANT_PRESET_NAMES as readonly string[]).includes(kind);
}

/** The tabs of the menu, and what each one lists. */
const TABS = [
  { id: "shapes", label: "Shapes", kinds: PRIMITIVE_KINDS },
  { id: "plants", label: "Plants", kinds: PLANT_PRESET_NAMES },
  { id: "lights", label: "Lights", kinds: LIGHT_KINDS },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** The "Add" button and its pop-up list of shapes. Keys 1 to 5 add a shape without opening it. */
export default function AddMenu() {
  const addPrimitive = useSceneStore((state) => state.addPrimitive);
  const addLight = useSceneStore((state) => state.addLight);
  const addPlant = useSceneStore((state) => state.addPlant);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("shapes");
  const kinds: readonly MenuKind[] =
    TABS.find((entry) => entry.id === tab)?.kinds ?? PRIMITIVE_KINDS;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // While open: put the focus on the first item (again when the tab changes), and close when the
  // pointer goes down outside
  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, tab]);

  function onMenuKeyDown(event: KeyboardEvent) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      // Left and right switch between the tabs
      event.preventDefault();
      // Left and right go to the tab before or after this one
      const order = TABS.map((entry) => entry.id);
      setTab((current) => {
        const step = event.key === "ArrowRight" ? 1 : -1;
        return order[
          (order.indexOf(current) + step + order.length) % order.length
        ]!;
      });
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    }
  }

  function choose(kind: MenuKind) {
    if ((LIGHT_KINDS as readonly string[]).includes(kind)) {
      addLight(kind as LightKind);
    } else if ((PLANT_PRESET_NAMES as readonly string[]).includes(kind)) {
      addPlant(kind as PlantPresetName);
    } else {
      addPrimitive(kind as PrimitiveKind);
    }
    setOpen(false);
  }

  // The wrapper below is not "relative" on purpose: the menu is placed against the whole Scene panel
  // (which is), with its right edge under the Add button (the header has 14px of padding, `right-3.5`).
  // It is 18rem wide, but never wider than the panel, so it fits however the panel has been resized.
  return (
    <div ref={rootRef}>
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
          className="absolute top-12 right-3.5 z-30 w-72 max-w-[calc(100%-1.75rem)] rounded-xl border border-ed-line-strong bg-ed-raised p-1.5 shadow-2xl shadow-black/50"
        >
          <div
            role="tablist"
            aria-label="Kinds of object"
            className="mb-1.5 flex gap-1 rounded-lg bg-ed-panel p-1"
          >
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={`h-7 flex-1 rounded-md text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-ed-accent ${
                  tab === entry.id
                    ? "bg-ed-raised text-ed-text"
                    : "text-ed-text-3 hover:text-ed-text"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
          {kinds.map((kind, index) => (
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
                {isPlantPreset(kind) ? (
                  <Icon name={kind} />
                ) : (
                  <KindIcon kind={kind} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {isPlantPreset(kind)
                    ? PLANT_PRESET_INFO[kind].label
                    : KIND_LABELS[kind]}
                </span>
                <span className="block truncate text-xs text-ed-text-3">
                  {KIND_HINTS[kind]}
                </span>
              </span>
              {tab === "shapes" && (
                <kbd className="rounded border border-ed-line-strong px-1.5 font-mono text-[11px] leading-[17px] text-ed-text-3">
                  {index + 1}
                </kbd>
              )}
            </button>
          ))}
          <p className="mx-1.5 mt-1.5 mb-1 border-t border-ed-line-strong pt-2 text-[11px] text-ed-text-3">
            {tab === "shapes"
              ? "New shapes appear in the middle of the scene and are selected."
              : tab === "plants"
                ? "New plants grow in the middle of the scene. Change every number, or the seed, in the Inspector."
                : "New lights start above the scene, aimed at the middle."}
          </p>
        </div>
      )}
    </div>
  );
}
