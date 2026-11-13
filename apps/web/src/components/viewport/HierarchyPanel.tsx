"use client";

import { useMemo, useState, type PointerEvent } from "react";
import {
  buildSceneTree,
  flattenTree,
  searchNodes,
  type TreeRow,
} from "@sceneroom/shared";
import { useLayoutStore } from "@/store/layoutStore";
import { useSceneStore } from "@/store/sceneStore";
import AddMenu from "./AddMenu";
import PanelResizer from "./PanelResizer";
import { ROOT_DROP_ID, useRowDrag, type RowDrag } from "./useRowDrag";
import { Icon, KindIcon } from "./icons";

/** DOM id of the search box, so the "/" shortcut can focus it. */
export const SEARCH_INPUT_ID = "scene-search";

/**
 * Left panel: the scene as a tree, with a search box and the Add menu.
 * Click a row to select it (Shift, Ctrl or Cmd + click to add or remove it from the selection).
 * The eye button hides or shows an object in the viewport.
 */
export default function HierarchyPanel() {
  const scene = useSceneStore((state) => state.scene);
  const selectedIds = useSceneStore((state) => state.selectedIds);
  const width = useLayoutStore((state) => state.leftWidth);

  // UI-only state, not part of the scene: folded-away parents and the search text
  const collapsed = useLayoutStore((state) => state.collapsedIds);
  const toggleCollapsed = useLayoutStore((state) => state.toggleCollapsed);
  const [query, setQuery] = useState("");
  const { drag, startDrag, justDragged } = useRowDrag();

  const total = Object.keys(scene.nodes).length;

  const rows = useMemo<TreeRow[]>(() => {
    const matches = searchNodes(scene, query);
    // While searching: a flat list of matches, without folding or indenting
    if (matches) {
      return matches.map((node) => ({
        node,
        depth: 0,
        hasChildren: false,
        expanded: false,
      }));
    }
    return flattenTree(buildSceneTree(scene), collapsed);
  }, [scene, collapsed, query]);

  return (
    <aside
      aria-label="Scene"
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-ed-line bg-ed-panel"
    >
      <PanelResizer side="left" />
      <div className="flex h-13 shrink-0 items-center gap-2 px-3.5">
        <h2 className="text-[13px] font-semibold tracking-wide">Scene</h2>
        <span className="text-xs text-ed-text-3">
          {total} {total === 1 ? "object" : "objects"}
        </span>
        <span className="flex-1" />
        <AddMenu />
      </div>

      <label className="mx-3 mb-2 flex h-8 items-center gap-2 rounded-lg border border-ed-line bg-ed-field px-2.5 text-ed-text-3 focus-within:border-ed-accent">
        <Icon name="search" />
        <input
          id={SEARCH_INPUT_ID}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
              event.currentTarget.blur();
            }
          }}
          placeholder="Search objects"
          aria-label="Search objects"
          className="min-w-0 flex-1 bg-transparent text-sm text-ed-text outline-none placeholder:text-ed-text-3"
        />
        <kbd className="rounded border border-ed-line-strong px-1.5 font-mono text-[11px] leading-[17px]">
          /
        </kbd>
      </label>

      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ed-text-3">
          {total === 0
            ? "The scene is empty. Use Add to place your first object."
            : "No objects match your search."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-0.5 select-none">
          {rows.map((row) => (
            <HierarchyRow
              key={row.node.id}
              row={row}
              selected={selectedIds.includes(row.node.id)}
              drag={drag}
              onToggleCollapsed={toggleCollapsed}
              onPressNode={startDrag}
              justDragged={justDragged}
            />
          ))}
          {drag && <TopLevelDropZone drag={drag} />}
        </ul>
      )}

      <p className="m-3 rounded-lg bg-ed-field px-3 py-2.5 text-xs leading-relaxed text-ed-text-2">
        Click to select. <b className="font-medium text-ed-text">Shift-click</b>{" "}
        to add more. Drag a row onto another to make it a child.
      </p>

      {drag && <DragGhost drag={drag} />}
    </aside>
  );
}

/** Space taken by each level of nesting. */
const INDENT_PX = 14;

/** The "top level" target at the end of the list, shown only while a row is being dragged. */
function TopLevelDropZone({ drag }: { drag: RowDrag }) {
  const over = drag.targetId === ROOT_DROP_ID;
  return (
    <li
      data-drop-id={ROOT_DROP_ID}
      className={`mt-1 grid h-10 place-items-center rounded-lg border border-dashed text-xs ${
        over && drag.valid
          ? "border-ed-accent bg-ed-accent/16 text-ed-text"
          : "border-ed-line-strong text-ed-text-3"
      }`}
    >
      Drop here for the top level
    </li>
  );
}

/** A small label that follows the pointer while dragging. */
function DragGhost({ drag }: { drag: RowDrag }) {
  return (
    <div
      aria-hidden="true"
      style={{ left: drag.x + 14, top: drag.y + 14 }}
      className="pointer-events-none fixed z-50 rounded-md border border-ed-line-strong bg-ed-raised px-2.5 py-1 text-xs shadow-lg shadow-black/40"
    >
      {drag.label}
    </div>
  );
}

function HierarchyRow({
  row,
  selected,
  drag,
  onToggleCollapsed,
  onPressNode,
  justDragged,
}: {
  row: TreeRow;
  selected: boolean;
  drag: RowDrag | null;
  onToggleCollapsed: (id: string) => void;
  onPressNode: (
    event: PointerEvent<HTMLElement>,
    nodeId: string,
    nodeName: string,
  ) => void;
  /** True for a moment after a drag ends, so the click that follows it is ignored. */
  justDragged: { current: boolean };
}) {
  const select = useSceneStore((state) => state.select);
  const toggleSelect = useSceneStore((state) => state.toggleSelect);
  const setNodeVisible = useSceneStore((state) => state.setNodeVisible);
  const { node, depth, hasChildren, expanded } = row;

  const beingDragged = drag?.ids.includes(node.id) ?? false;
  const isTarget = drag?.targetId === node.id;
  const dropClass = isTarget
    ? drag.valid
      ? "bg-ed-accent/20 outline-2 -outline-offset-2 outline-ed-accent"
      : "outline-2 -outline-offset-2 outline-ed-danger/60 cursor-not-allowed"
    : selected
      ? "bg-ed-select/13 shadow-[inset_2px_0_0_var(--color-ed-select)]"
      : drag
        ? ""
        : "hover:bg-ed-field";

  return (
    <li
      data-drop-id={node.id}
      style={{ paddingLeft: depth * INDENT_PX }}
      className={`relative flex h-8 items-center gap-1.5 rounded-lg pr-1 ${dropClass} ${
        beingDragged ? "opacity-50" : ""
      }`}
    >
      {hasChildren ? (
        <button
          type="button"
          aria-label={`${expanded ? "Fold" : "Unfold"} ${node.name}`}
          aria-expanded={expanded}
          onClick={() => onToggleCollapsed(node.id)}
          className="grid size-[18px] shrink-0 place-items-center rounded text-ed-text-3 hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent"
        >
          <Icon
            name={expanded ? "chevronDown" : "chevronRight"}
            className="size-3"
          />
        </button>
      ) : (
        <span className="size-[18px] shrink-0" aria-hidden="true" />
      )}

      <button
        type="button"
        aria-pressed={selected}
        onPointerDown={(event) => onPressNode(event, node.id, node.name)}
        onClick={(event) => {
          if (justDragged.current) return;
          if (event.shiftKey || event.ctrlKey || event.metaKey)
            toggleSelect(node.id);
          else select(node.id);
        }}
        className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded text-left text-sm focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        <span
          className={
            selected
              ? "text-ed-select"
              : node.visible
                ? "text-ed-text-2"
                : "text-ed-text-3"
          }
        >
          <KindIcon kind={node.kind} />
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${
            node.visible ? "" : "text-ed-text-3 italic"
          }`}
        >
          {node.name}
        </span>
      </button>

      {isTarget && drag.valid && (
        <span className="pointer-events-none absolute right-9 rounded-full bg-ed-accent px-2 py-0.5 text-[11px] font-medium text-white">
          Make a child
        </span>
      )}

      <button
        type="button"
        aria-label={`${node.visible ? "Hide" : "Show"} ${node.name}`}
        aria-pressed={!node.visible}
        title={node.visible ? "Hide" : "Show"}
        onClick={() => setNodeVisible(node.id, !node.visible)}
        className="grid size-[26px] shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        <Icon name={node.visible ? "eye" : "eyeOff"} />
      </button>
    </li>
  );
}
