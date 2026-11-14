"use client";

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import {
  editableIds,
  pasteTarget,
  resolveAutoPlacement,
  stepPlacement,
} from "@sceneroom/shared";
import { useContextMenuStore } from "@/store/contextMenuStore";
import { useSceneStore } from "@/store/sceneStore";
import { pasteClipboard } from "./clipboardActions";
import { OBJECT_NAME_INPUT_ID } from "./domIds";
import { moveToParent } from "./reparent";

type MenuItem =
  | { separator: true }
  | {
      separator?: false;
      label: string;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void;
    };

/** How a shortcut is written on this computer: ⌘X on a Mac, Ctrl+X elsewhere. */
function shortcut(key: string): string {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}

/** The right-click menu, drawn at the pointer. Shown for objects (and rows of the scene list) and for empty space. */
export default function ContextMenu() {
  const menu = useContextMenuStore((state) => state.menu);
  if (!menu) return null;
  return <MenuBody menu={menu} />;
}

function MenuBody({
  menu,
}: {
  menu: NonNullable<ReturnType<typeof useContextMenuStore.getState>["menu"]>;
}) {
  const close = useContextMenuStore((state) => state.close);
  const scene = useSceneStore((state) => state.scene);
  const selectedIds = useSceneStore((state) => state.selectedIds);
  const clipboard = useSceneStore((state) => state.clipboard);
  const store = useSceneStore.getState;
  const ref = useRef<HTMLDivElement>(null);

  const count = selectedIds.length;
  const suffix = count > 1 ? ` ${count}` : "";
  const canEdit = editableIds(scene, selectedIds).length > 0;
  const allVisible = selectedIds.every((id) => scene.nodes[id]?.visible);
  const allLocked = selectedIds.every((id) => scene.nodes[id]?.locked);

  /** Closes the menu, then does the action. */
  const act = (action: () => void) => () => {
    close();
    action();
  };

  // Where a paste could go from here, and whether each is allowed (so the items can be greyed out)
  const [onlyId] = selectedIds;
  const onlyNode = count === 1 && onlyId ? scene.nodes[onlyId] : undefined;
  const canPasteBeside =
    !!clipboard && pasteTarget(scene, selectedIds, clipboard, "beside").ok;
  const canPasteAuto =
    !!clipboard && pasteTarget(scene, selectedIds, clipboard, "auto").ok;
  // Plain Paste goes inside the selected object unless that object is what was copied
  const pastesInto =
    !!clipboard &&
    typeof resolveAutoPlacement(scene, selectedIds, clipboard) === "object";
  const intoName =
    onlyNode && onlyNode.name.length > 18
      ? `${onlyNode.name.slice(0, 17)}…`
      : onlyNode?.name;

  // Move up / down: one place among the objects in the same parent (only for a single, editable object)
  const stepUp = onlyNode ? stepPlacement(scene, onlyNode.id, "up") : null;
  const stepDown = onlyNode ? stepPlacement(scene, onlyNode.id, "down") : null;
  const canMove = !!onlyNode && canEdit;

  const items: MenuItem[] =
    menu.target === "empty"
      ? [
          {
            label: "Paste",
            shortcut: shortcut("V"),
            disabled: !clipboard,
            onSelect: act(() => pasteClipboard("top")),
          },
        ]
      : [
          {
            label: `Cut${suffix}`,
            shortcut: shortcut("X"),
            disabled: !canEdit,
            onSelect: act(() => store().cutSelected()),
          },
          {
            label: `Copy${suffix}`,
            shortcut: shortcut("C"),
            onSelect: act(() => store().copySelected()),
          },
          {
            label: pastesInto ? `Paste into “${intoName}”` : "Paste",
            shortcut: shortcut("V"),
            disabled: !canPasteAuto,
            onSelect: act(() => pasteClipboard("auto")),
          },
          {
            label: "Paste beside",
            shortcut: `⇧${shortcut("V")}`,
            disabled: !canPasteBeside,
            onSelect: act(() => pasteClipboard("beside")),
          },
          {
            label: "Paste at top level",
            disabled: !clipboard,
            onSelect: act(() => pasteClipboard("top")),
          },
          {
            label: `Duplicate${suffix}`,
            shortcut: shortcut("D"),
            onSelect: act(() => store().duplicateSelected()),
          },
          { separator: true },
          {
            label: "Rename",
            disabled: count !== 1 || !canEdit,
            onSelect: act(() => {
              // Focus the name box in the Inspector once it is on screen
              requestAnimationFrame(() => {
                const input = document.getElementById(OBJECT_NAME_INPUT_ID);
                if (input instanceof HTMLInputElement) {
                  input.focus();
                  input.select();
                }
              });
            }),
          },
          {
            label: "Move up",
            disabled: !canMove || !stepUp,
            onSelect: act(() => {
              if (onlyNode && stepUp)
                moveToParent(
                  [onlyNode.id],
                  stepUp.parentId,
                  "Move up",
                  stepUp.beforeId,
                );
            }),
          },
          {
            label: "Move down",
            disabled: !canMove || !stepDown,
            onSelect: act(() => {
              if (onlyNode && stepDown)
                moveToParent(
                  [onlyNode.id],
                  stepDown.parentId,
                  "Move down",
                  stepDown.beforeId,
                );
            }),
          },
          {
            label: allVisible ? `Hide${suffix}` : `Show${suffix}`,
            onSelect: act(() =>
              store().setNodesVisible(selectedIds, !allVisible),
            ),
          },
          {
            label: allLocked ? `Unlock${suffix}` : `Lock${suffix}`,
            shortcut: "L",
            onSelect: act(() =>
              store().setNodesLocked(selectedIds, !allLocked),
            ),
          },
          {
            label: "Reset transform",
            disabled: !canEdit,
            onSelect: act(() => store().resetSelectedTransforms()),
          },
          { separator: true },
          {
            label: `Delete${suffix}`,
            shortcut: "Del",
            danger: true,
            disabled: !canEdit,
            onSelect: act(() => store().deleteSelected()),
          },
        ];

  // Keep the menu inside the window: move it left or up if it would run off the edge
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - height - 8))}px`;
  }, [menu.x, menu.y]);

  // Close when the pointer goes down outside, or the window changes; put the focus on the first usable item
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>("button:not([disabled])")
      ?.focus();
    function closeIfOutside(event: Event) {
      if (!ref.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", closeIfOutside, true);
    document.addEventListener("contextmenu", closeIfOutside, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside, true);
      document.removeEventListener("contextmenu", closeIfOutside, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [close]);

  // If the scene or the selection changes while the menu is open (a keyboard shortcut, say), close it
  useEffect(
    () =>
      useSceneStore.subscribe((state, previous) => {
        if (
          state.scene !== previous.scene ||
          state.selectedIds !== previous.selectedIds
        ) {
          close();
        }
      }),
    [close],
  );

  function onKeyDown(event: KeyboardEvent) {
    const buttons = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])",
      ) ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      buttons.at(-1)?.focus();
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Object actions"
      onKeyDown={onKeyDown}
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-50 min-w-52 rounded-xl border border-ed-line-strong bg-ed-raised p-1.5 text-sm shadow-2xl shadow-black/50"
    >
      {items.map((item, index) =>
        item.separator ? (
          <div
            key={`separator-${index}`}
            role="separator"
            className="my-1 h-px bg-ed-line-strong"
          />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={item.onSelect}
            className={`flex w-full items-center justify-between gap-6 rounded-md px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none enabled:hover:bg-ed-accent/30 enabled:focus-visible:bg-ed-accent/30 disabled:cursor-not-allowed disabled:text-ed-text-3 disabled:opacity-60 ${
              item.danger ? "text-ed-danger" : ""
            }`}
          >
            {item.label}
            {item.shortcut && (
              <span className="font-mono text-xs text-ed-text-3">
                {item.shortcut}
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
