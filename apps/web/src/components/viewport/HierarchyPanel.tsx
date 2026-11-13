"use client";

import { useMemo, useState } from "react";
import {
  PRIMITIVE_KINDS,
  buildSceneTree,
  flattenTree,
  type PrimitiveKind,
  type TreeRow,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { overlayButton } from "./buttonStyle";

const KIND_LABELS: Record<PrimitiveKind, string> = {
  cube: "Cube",
  sphere: "Sphere",
  cylinder: "Cylinder",
  plane: "Plane",
  cone: "Cone",
};

/**
 * Left panel: buttons to add objects, and the list of everything in the scene as a tree.
 * Click a row to select it (Shift, Ctrl or Cmd + click to add or remove it from the selection).
 * The eye button hides or shows an object in the viewport.
 */
export default function HierarchyPanel() {
  const scene = useSceneStore((state) => state.scene);
  const selectedIds = useSceneStore((state) => state.selectedIds);
  const addPrimitive = useSceneStore((state) => state.addPrimitive);

  // Folded-away parents live here (UI state only, not part of the scene)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const rows = useMemo(
    () => flattenTree(buildSceneTree(scene), collapsed),
    [scene, collapsed],
  );

  function toggleCollapsed(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <aside
      aria-label="Hierarchy"
      className="absolute top-3 bottom-3 left-3 flex w-64 flex-col gap-2 rounded-lg bg-zinc-900/90 p-2 text-zinc-200 shadow-lg"
    >
      <h2 className="px-1 pt-1 text-xs tracking-wide text-zinc-400 uppercase">
        Add
      </h2>
      <div
        role="toolbar"
        aria-label="Add object"
        className="flex flex-wrap gap-1"
      >
        {PRIMITIVE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => addPrimitive(kind)}
            className={`${overlayButton} border border-zinc-600 px-2 py-1 hover:bg-zinc-700`}
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <h2 className="px-1 pt-2 text-xs tracking-wide text-zinc-400 uppercase">
        Hierarchy
      </h2>
      {rows.length === 0 ? (
        <p className="px-1 text-sm text-zinc-500">
          The scene is empty. Add an object above.
        </p>
      ) : (
        <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
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
    </aside>
  );
}

/** Space taken by each level of nesting, and by the fold arrow. */
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
      className={`flex items-center gap-1 rounded ${
        selected ? "bg-sky-700/60" : "hover:bg-zinc-800"
      }`}
      style={{ paddingLeft: depth * INDENT_PX }}
    >
      {hasChildren ? (
        <button
          type="button"
          aria-label={`${expanded ? "Fold" : "Unfold"} ${node.name}`}
          aria-expanded={expanded}
          onClick={() => onToggleCollapsed(node.id)}
          className="w-5 shrink-0 text-xs text-zinc-400 hover:text-zinc-100"
        >
          {expanded ? "▾" : "▸"}
        </button>
      ) : (
        <span className="w-5 shrink-0" aria-hidden="true" />
      )}
      <button
        type="button"
        aria-pressed={selected}
        onClick={(event) => {
          if (event.shiftKey || event.ctrlKey || event.metaKey)
            toggleSelect(node.id);
          else select(node.id);
        }}
        className={`min-w-0 flex-1 truncate py-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-sky-400 ${
          node.visible ? "" : "text-zinc-500 italic"
        }`}
      >
        {node.name}
      </button>
      <button
        type="button"
        aria-label={`${node.visible ? "Hide" : "Show"} ${node.name}`}
        aria-pressed={!node.visible}
        onClick={() => setNodeVisible(node.id, !node.visible)}
        className="shrink-0 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100"
      >
        {node.visible ? "Hide" : "Show"}
      </button>
    </li>
  );
}
