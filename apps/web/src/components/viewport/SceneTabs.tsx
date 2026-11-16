"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type ReactNode,
} from "react";
import {
  MAX_SCENE_NAME_LENGTH,
  SCENE_TEMPLATES,
  SCENE_TEMPLATE_INFO,
} from "@sceneroom/shared";
import { useImportStore } from "@/store/importStore";
import { sceneObjectCount, useProjectStore } from "@/store/projectStore";
import { Icon } from "./icons";

/** Tells the person why something was refused, in the bar over the 3D view. */
function tellProblem(text: string | null) {
  if (text) useImportStore.getState().setMessage({ tone: "error", text });
}

type MenuEntry =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      help?: string;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void;
    };

/** A small menu under a button. Closes on a click outside, Escape or choosing something. */
function DropMenu({
  entries,
  label,
  onClose,
  anchor,
}: {
  entries: MenuEntry[];
  label: string;
  onClose: () => void;
  /** The element the menu hangs under. The menu is placed with `fixed` so a scrolling tab strip cannot clip it. */
  anchor: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const target = anchor.current;
    if (!element || !target) return;
    const rect = target.getBoundingClientRect();
    const { width } = element.getBoundingClientRect();
    element.style.top = `${rect.bottom + 4}px`;
    element.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  }, [anchor]);

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>("button:not([disabled])")
      ?.focus();
    const closeIfOutside = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", closeIfOutside, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  function onKeyDown(event: KeyboardEvent) {
    const buttons = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])",
      ) ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="fixed z-50 min-w-52 rounded-xl border border-ed-line-strong bg-ed-raised p-1.5 text-sm shadow-2xl shadow-black/50"
    >
      {entries.map((entry, index) =>
        entry.separator ? (
          <div
            key={`separator-${index}`}
            role="separator"
            className="my-1 h-px bg-ed-line-strong"
          />
        ) : (
          <button
            key={entry.label}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
            className={`flex w-full flex-col rounded-md px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none enabled:hover:bg-ed-accent/30 enabled:focus-visible:bg-ed-accent/30 disabled:cursor-not-allowed disabled:text-ed-text-3 disabled:opacity-60 ${
              entry.danger ? "text-ed-danger" : ""
            }`}
          >
            {entry.label}
            {entry.help && (
              <span className="text-xs text-ed-text-3">{entry.help}</span>
            )}
          </button>
        ),
      )}
    </div>
  );
}

/** The name of a scene turned into a text box: Enter keeps the new name, Escape or a click away from it. */
function RenameBox({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const finish = (name: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(name);
  };
  return (
    <input
      autoFocus
      value={value}
      maxLength={MAX_SCENE_NAME_LENGTH}
      aria-label="Scene name"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation(); // typing a name must not trigger editor shortcuts
        if (event.key === "Enter") finish(value);
        else if (event.key === "Escape") finish(null);
      }}
      onBlur={() => finish(value)}
      className="h-6 w-32 rounded border border-ed-accent bg-ed-bg px-1.5 text-sm text-ed-text outline-none"
    />
  );
}

/** Asks before a scene is deleted (it cannot be brought back). */
function confirmDelete(name: string, objects: number): boolean {
  return window.confirm(
    `Delete the scene "${name}" (${objects} object${objects === 1 ? "" : "s"})? This cannot be undone.`,
  );
}

function SceneTab({
  index,
  count,
  id,
  name,
  active,
}: {
  index: number;
  count: number;
  id: string;
  name: string;
  active: boolean;
}) {
  const switchScene = useProjectStore((s) => s.switchScene);
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  const entries: MenuEntry[] = [
    { label: "Rename", onSelect: () => setRenaming(true) },
    {
      label: "Duplicate",
      onSelect: () =>
        tellProblem(useProjectStore.getState().duplicateScene(id)),
    },
    { separator: true },
    {
      label: "Move left",
      disabled: index === 0,
      onSelect: () => useProjectStore.getState().moveScene(id, index - 1),
    },
    {
      label: "Move right",
      disabled: index === count - 1,
      onSelect: () => useProjectStore.getState().moveScene(id, index + 1),
    },
    { separator: true },
    {
      label: "Delete scene",
      danger: true,
      disabled: count <= 1,
      help: count <= 1 ? "A project needs one scene" : undefined,
      onSelect: () => {
        if (confirmDelete(name, sceneObjectCount(id))) {
          tellProblem(useProjectStore.getState().deleteScene(id));
        }
      },
    },
  ];

  if (renaming) {
    return (
      <RenameBox
        initial={name}
        onDone={(next) => {
          setRenaming(false);
          if (next !== null && next.trim() !== name) {
            tellProblem(useProjectStore.getState().renameScene(id, next));
          }
        }}
      />
    );
  }

  return (
    <div ref={wrapper} className="flex shrink-0 items-center">
      <button
        type="button"
        role="tab"
        aria-selected={active}
        title={
          active
            ? `${name}: double-click to rename, right-click for more`
            : `Open the scene "${name}"`
        }
        onClick={() => switchScene(id)}
        onDoubleClick={() => setRenaming(true)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuOpen(true);
        }}
        className={`h-7 max-w-44 truncate rounded-md px-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ed-accent ${
          active
            ? "bg-ed-raised text-ed-text"
            : "text-ed-text-3 hover:bg-ed-raised/60 hover:text-ed-text"
        }`}
      >
        {name}
      </button>
      {active && (
        <button
          type="button"
          aria-label={`More for the scene ${name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Rename, duplicate, move or delete this scene"
          onClick={() => setMenuOpen((open) => !open)}
          className="ml-0.5 grid size-6 place-items-center rounded text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent"
        >
          <span aria-hidden="true">⋯</span>
        </button>
      )}
      {menuOpen && (
        <DropMenu
          entries={entries}
          label={`Scene ${name}`}
          anchor={wrapper}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

function NewSceneButton() {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const entries: MenuEntry[] = SCENE_TEMPLATES.map((template) => ({
    label: SCENE_TEMPLATE_INFO[template].label,
    help: SCENE_TEMPLATE_INFO[template].help,
    onSelect: () => tellProblem(useProjectStore.getState().addScene(template)),
  }));
  return (
    <div ref={wrapper} className="shrink-0">
      <button
        type="button"
        aria-label="New scene"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Add a scene to this project (a room for NPCs, one for buildings, one to put it all together…)"
        onClick={() => setOpen((value) => !value)}
        className="grid size-7 place-items-center rounded-md text-ed-text-2 transition-colors hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        <Icon name="plus" />
      </button>
      {open && (
        <DropMenu
          entries={entries}
          label="New scene from a template"
          anchor={wrapper}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/** The project name and one tab per scene, with a button to add a scene. */
export default function SceneTabs(): ReactNode {
  const projectName = useProjectStore((s) => s.name);
  const scenes = useProjectStore((s) => s.scenes);
  const activeSceneId = useProjectStore((s) => s.activeSceneId);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span
        className="shrink-0 text-sm text-ed-text-3"
        title="The project holds all your scenes"
      >
        {projectName}
      </span>
      <span className="text-ed-text-3" aria-hidden="true">
        /
      </span>
      <div
        role="tablist"
        aria-label="Scenes in this project"
        className="flex min-w-0 items-center gap-0.5 overflow-x-auto"
      >
        {scenes.map((scene, index) => (
          <SceneTab
            key={scene.id}
            index={index}
            count={scenes.length}
            id={scene.id}
            name={scene.name}
            active={scene.id === activeSceneId}
          />
        ))}
      </div>
      <NewSceneButton />
    </div>
  );
}
