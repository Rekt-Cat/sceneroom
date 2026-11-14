"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  buildSceneTree,
  cutNodeIds,
  flattenTree,
  isEffectivelyLocked,
  rangeBetween,
  searchNodes,
  type TreeRow,
} from "@sceneroom/shared";
import { useContextMenuStore } from "@/store/contextMenuStore";
import { useLayoutStore } from "@/store/layoutStore";
import { useSceneStore } from "@/store/sceneStore";
import AddMenu from "./AddMenu";
import ImportButton from "./ImportButton";
import PanelResizer from "./PanelResizer";
import AssetsPanel from "./AssetsPanel";
import {
  ROOT_DROP_ID,
  SCROLL_LIST_ATTRIBUTE,
  useRowDrag,
  type RowDrag,
} from "./useRowDrag";
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
  const clipboard = useSceneStore((state) => state.clipboard);
  const width = useLayoutStore((state) => state.leftWidth);

  // UI-only state, not part of the scene: folded-away parents and the search text
  const collapsed = useLayoutStore((state) => state.collapsedIds);
  const toggleCollapsed = useLayoutStore((state) => state.toggleCollapsed);
  const [query, setQuery] = useState("");
  const { drag, startDrag, justDragged } = useRowDrag();

  const total = Object.keys(scene.nodes).length;
  const assetCount = Object.values(scene.assets).filter(
    (asset) => asset.type === "model",
  ).length;
  // Which tab of the left panel is showing (not saved: it starts on the scene list)
  const [tab, setTab] = useState<"scene" | "assets">("scene");
  // Objects that are cut (waiting to be pasted somewhere) are shown greyed
  const cutIds = useMemo(
    () => cutNodeIds(scene, clipboard),
    [scene, clipboard],
  );

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

  // The row that Shift + click measures from: the last one clicked on its own (or added with Ctrl/Cmd)
  const anchorRef = useRef<string | null>(null);
  // Whenever exactly one object is selected, however it was selected, it becomes the anchor
  useEffect(() => {
    if (selectedIds.length === 1) anchorRef.current = selectedIds[0] ?? null;
  }, [selectedIds]);

  /**
   * What clicking a row does, like a file browser:
   * - plain click: select just that row
   * - Ctrl or Cmd + click: add or remove just that row (one at a time)
   * - Shift + click: select every row from the anchor to this one, as they are listed now
   *   (with Ctrl or Cmd as well, add that range to the current selection)
   */
  function selectRow(
    id: string,
    modifiers: { range: boolean; toggle: boolean },
  ) {
    const store = useSceneStore.getState();
    if (modifiers.range) {
      const range = rangeBetween(
        rows.map((row) => row.node.id),
        anchorRef.current,
        id,
      );
      const anchorVisible = rows.some(
        (row) => row.node.id === anchorRef.current,
      );
      if (!anchorVisible) anchorRef.current = id;
      store.setSelection(
        modifiers.toggle ? [...store.selectedIds, ...range] : range,
      );
    } else if (modifiers.toggle) {
      store.toggleSelect(id);
      anchorRef.current = id;
    } else {
      store.select(id);
      anchorRef.current = id;
    }
  }

  return (
    <aside
      aria-label="Scene"
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-ed-line bg-ed-panel"
    >
      <PanelResizer side="left" />
      <div className="flex h-13 shrink-0 items-center gap-2 px-3.5">
        <div role="tablist" aria-label="Left panel" className="flex gap-1">
          <PanelTab
            label="Scene"
            count={total}
            active={tab === "scene"}
            onSelect={() => setTab("scene")}
          />
          <PanelTab
            label="Assets"
            count={assetCount}
            active={tab === "assets"}
            onSelect={() => setTab("assets")}
          />
        </div>
        <span className="flex-1" />
        <ImportButton />
        {tab === "scene" && <AddMenu />}
      </div>

      {tab === "assets" ? (
        <AssetsPanel />
      ) : (
        <>
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
            // The space between rows is padding on each row (py-0.5 twice = 4px), so it is part of the drop area
            <div className="relative flex min-h-0 flex-1 flex-col">
              <ul
                {...{ [SCROLL_LIST_ATTRIBUTE]: "" }}
                className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-1 select-none ${
                  drag ? "pb-14" : ""
                }`}
              >
                {/* While dragging something that sits inside a parent: a bar that stays at the top, to drop it onto */}
                {drag && drag.ids.some((id) => scene.nodes[id]?.parentId) && (
                  <TopLevelDrop drag={drag} variant="bar" />
                )}
                {rows.map((row) => (
                  <HierarchyRow
                    key={row.node.id}
                    row={row}
                    selected={selectedIds.includes(row.node.id)}
                    isCut={cutIds.has(row.node.id)}
                    drag={drag}
                    onToggleCollapsed={toggleCollapsed}
                    onPressNode={startDrag}
                    onSelectRow={selectRow}
                    justDragged={justDragged}
                    lockedByParent={
                      !row.node.locked &&
                      isEffectivelyLocked(scene, row.node.id)
                    }
                  />
                ))}
                {/* The empty space under the rows is the "top level" drop target too (not drawn) */}
                <TopLevelDrop drag={drag} variant="fill" />
              </ul>
              {/* While dragging: a drop area pinned to the bottom of the list, wherever the rows end */}
              {drag && <TopLevelDrop drag={drag} variant="pinned" />}
            </div>
          )}

          <p className="m-3 rounded-lg bg-ed-field px-3 py-2.5 text-xs leading-relaxed text-ed-text-2">
            Click to select.{" "}
            <b className="font-medium text-ed-text">Shift-click</b> selects
            everything in between,{" "}
            <b className="font-medium text-ed-text">Ctrl/Cmd-click</b> adds or
            removes one. Drag a row onto the middle of another to make it a
            child, onto an edge to put it before or after, or into the empty
            space to take it out of its parent.
          </p>
        </>
      )}

      {drag && <DragGhost drag={drag} />}
    </aside>
  );
}

/** One of the two tabs at the top of the left panel. */
function PanelTab({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold tracking-wide focus-visible:outline-2 focus-visible:outline-ed-accent ${
        active
          ? "bg-ed-raised text-ed-text"
          : "text-ed-text-3 hover:bg-ed-field hover:text-ed-text"
      }`}
    >
      {label}
      <span className="text-xs font-normal text-ed-text-3">{count}</span>
    </button>
  );
}

/** Space taken by each level of nesting. */
const INDENT_PX = 14;

/** How far in from the row's left edge the drop line starts (past the fold arrow), before the nesting is added. */
const DROP_LINE_INSET_PX = 22;

/**
 * A place to drop a dragged row to make it a top-level object (take it out of its parent). "bar" is a
 * strip that stays at the top of the list while dragging; "fill" is all the empty space under the rows
 * (always a drop target, and only drawn while dragging).
 */
function TopLevelDrop({
  drag,
  variant,
}: {
  drag: RowDrag | null;
  variant: "bar" | "fill" | "pinned";
}) {
  const over = drag?.target?.id === ROOT_DROP_ID && drag.target.valid;
  const label =
    variant === "bar"
      ? "Drop here to make it a top-level object"
      : "Or drop here, in the empty space";
  return (
    <li
      data-drop-id={ROOT_DROP_ID}
      aria-hidden="true"
      className={
        variant === "bar"
          ? `sticky top-0 z-10 grid h-9 shrink-0 place-items-center rounded-lg border border-dashed bg-ed-panel text-xs ${
              over
                ? "border-ed-accent bg-ed-accent/20 text-ed-text"
                : "border-ed-line-strong text-ed-text-3"
            }`
          : variant === "pinned"
            ? `absolute inset-x-2 bottom-1 z-10 grid h-12 place-items-center rounded-lg border border-dashed text-xs ${
                over
                  ? "border-ed-accent bg-ed-accent/20 text-ed-text"
                  : "border-ed-line-strong bg-ed-panel text-ed-text-3"
              }`
            : "min-h-12 flex-1"
      }
    >
      {variant === "fill" ? null : label}
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
  isCut,
  drag,
  onToggleCollapsed,
  onPressNode,
  onSelectRow,
  justDragged,
  lockedByParent,
}: {
  row: TreeRow;
  selected: boolean;
  /** True if the object is marked as cut (waiting to be pasted). */
  isCut: boolean;
  drag: RowDrag | null;
  onToggleCollapsed: (id: string) => void;
  onPressNode: (
    event: PointerEvent<HTMLElement>,
    nodeId: string,
    nodeName: string,
  ) => void;
  /** Called when the row is clicked, with which modifier keys were held. */
  onSelectRow: (
    id: string,
    modifiers: { range: boolean; toggle: boolean },
  ) => void;
  /** True for a moment after a drag ends, so the click that follows it is ignored. */
  justDragged: { current: boolean };
  /** True if this object is locked only because it sits inside a locked object. */
  lockedByParent: boolean;
}) {
  const select = useSceneStore((state) => state.select);
  const setNodeVisible = useSceneStore((state) => state.setNodeVisible);
  const setNodesLocked = useSceneStore((state) => state.setNodesLocked);
  const openContextMenu = useContextMenuStore((state) => state.open);
  const { node, depth, hasChildren, expanded } = row;

  const beingDragged = drag?.ids.includes(node.id) ?? false;
  // The part of this row the pointer is over while dragging: the middle ("into"), or an edge ("before" / "after")
  const target = drag?.target?.id === node.id ? drag.target : null;
  const intoRow = target?.zone === "into";
  const dropClass = intoRow
    ? target.valid
      ? "bg-ed-accent/20 outline-2 -outline-offset-2 outline-ed-accent"
      : "outline-2 -outline-offset-2 outline-ed-danger/60 cursor-not-allowed"
    : selected
      ? "bg-ed-select/13 shadow-[inset_2px_0_0_var(--color-ed-select)]"
      : drag
        ? ""
        : "hover:bg-ed-field";

  return (
    // The outer <li> is the drop area and has a little padding: that padding is the space between rows,
    // and because it belongs to the row there is no strip between rows where a drop would do nothing.
    <li
      data-drop-id={node.id}
      onContextMenu={(event) => {
        // Right-click a row: select it (unless it is already selected) and open the same menu as in the 3D view
        event.preventDefault();
        if (!selected) select(node.id);
        openContextMenu(event.clientX, event.clientY, "object");
      }}
      className="py-0.5"
    >
      <div
        style={{ paddingLeft: depth * INDENT_PX }}
        className={`group relative flex h-8 items-center gap-1.5 rounded-lg pr-1 ${dropClass} ${
          beingDragged || isCut ? "opacity-50" : ""
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
            onSelectRow(node.id, {
              range: event.shiftKey,
              toggle: event.ctrlKey || event.metaKey,
            });
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

        {lockedByParent ? (
          <span
            role="img"
            aria-label="Locked because it is inside a locked object"
            title="Locked because it is inside a locked object"
            className="grid size-[26px] shrink-0 place-items-center text-ed-text-3"
          >
            <Icon name="lock" />
          </span>
        ) : (
          <button
            type="button"
            aria-label={`${node.locked ? "Unlock" : "Lock"} ${node.name}`}
            aria-pressed={node.locked}
            title={node.locked ? "Unlock" : "Lock"}
            onClick={() => setNodesLocked([node.id], !node.locked)}
            className={`grid size-[26px] shrink-0 place-items-center rounded-md hover:bg-ed-raised hover:text-ed-text focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ed-accent ${
              node.locked
                ? "text-ed-text-2"
                : "text-ed-text-3 opacity-0 group-hover:opacity-100"
            }`}
          >
            <Icon name={node.locked ? "lock" : "unlock"} />
          </button>
        )}

        {intoRow && target.valid && (
          <span className="pointer-events-none absolute right-9 rounded-full bg-ed-accent px-2 py-0.5 text-[11px] font-medium text-white">
            Make a child
          </span>
        )}

        {/* The edges of a row: a line shows exactly where the dragged rows would be put, indented to the level they would have */}
        {target &&
          target.valid &&
          (target.zone === "before" || target.zone === "after") && (
            <span
              aria-hidden="true"
              style={{
                left:
                  (target.placement.parentId === node.id ? depth + 1 : depth) *
                    INDENT_PX +
                  DROP_LINE_INSET_PX,
              }}
              className={`pointer-events-none absolute right-1 z-10 h-0.5 rounded-full bg-ed-accent ${
                target.zone === "before" ? "-top-[3px]" : "-bottom-[3px]"
              }`}
            />
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
      </div>
    </li>
  );
}
