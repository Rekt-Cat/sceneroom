"use client";

import { useMemo, useState } from "react";
import {
  buildSceneTree,
  flattenTree,
  searchNodes,
  type TreeRow,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import AddMenu from "./AddMenu";
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

  // UI-only state, not part of the scene: folded-away parents and the search text
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");

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

  function toggleCollapsed(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <aside
      aria-label="Scene"
      className="flex w-72 shrink-0 flex-col border-r border-ed-line bg-ed-panel"
    >
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
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-0.5">
          {rows.map((row) => (
            <HierarchyRow
              key={row.node.id}
              row={row}
              selected={selectedIds.includes(row.node.id)}
              onToggleCollapsed={toggleCollapsed}
            />
          ))}
        </ul>
      )}

      <p className="m-3 rounded-lg bg-ed-field px-3 py-2.5 text-xs leading-relaxed text-ed-text-2">
        Click to select. <b className="font-medium text-ed-text">Shift-click</b>{" "}
        to add more.
      </p>
    </aside>
  );
}

/** Space taken by each level of nesting. */
const INDENT_PX = 14;

function HierarchyRow({
  row,
  selected,
  onToggleCollapsed,
}: {
  row: TreeRow;
  selected: boolean;
  onToggleCollapsed: (id: string) => void;
}) {
  const select = useSceneStore((state) => state.select);
  const toggleSelect = useSceneStore((state) => state.toggleSelect);
  const setNodeVisible = useSceneStore((state) => state.setNodeVisible);
  const { node, depth, hasChildren, expanded } = row;

  return (
    <li
      style={{ paddingLeft: depth * INDENT_PX }}
      className={`flex h-8 items-center gap-1.5 rounded-lg pr-1 ${
        selected
          ? "bg-ed-select/13 shadow-[inset_2px_0_0_var(--color-ed-select)]"
          : "hover:bg-ed-field"
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
        onClick={(event) => {
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
