"use client";

import { useState } from "react";
import { NODE_NAME_MAX_LENGTH, type SceneNode } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { AppearanceSection, TransformSection } from "./InspectorFields";
import { Icon, KIND_LABELS, KindIcon } from "./icons";

const actionButton =
  "flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-accent";

/**
 * Right panel. One object selected: its name and actions. Several: only a count and the names
 * (no per-object details). Nothing selected: a short hint.
 */
export default function InspectorPanel() {
  const selectedIds = useSceneStore((state) => state.selectedIds);
  const nodes = useSceneStore((state) => state.scene.nodes);

  let content;
  if (selectedIds.length === 0) {
    content = <EmptyState />;
  } else if (selectedIds.length === 1) {
    const node = nodes[selectedIds[0]!];
    // key: start with a fresh text box whenever a different object is selected
    content = node ? (
      <SingleObject key={node.id} node={node} />
    ) : (
      <EmptyState />
    );
  } else {
    content = <SeveralObjects ids={selectedIds} />;
  }

  return (
    <aside
      aria-label="Inspector"
      className="flex w-76 shrink-0 flex-col border-l border-ed-line bg-ed-panel"
    >
      {content}
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="px-5 py-8 text-sm leading-relaxed text-ed-text-3">
      <p className="mb-1 font-medium text-ed-text-2">Nothing selected</p>
      <p>
        Click an object in the list or in the 3D view to see it here. Drag a box
        with Ctrl or Cmd held to select several.
      </p>
    </div>
  );
}

function Actions({ count }: { count: number }) {
  const duplicateSelected = useSceneStore((state) => state.duplicateSelected);
  const deleteSelected = useSceneStore((state) => state.deleteSelected);
  const suffix = count > 1 ? ` ${count}` : "";

  return (
    <div className="mt-auto flex gap-2 border-t border-ed-line px-4 pt-3 pb-4">
      <button
        type="button"
        onClick={duplicateSelected}
        title="Duplicate (Ctrl or Cmd + D)"
        className={`${actionButton} border border-ed-line-strong bg-ed-raised hover:brightness-110`}
      >
        <Icon name="copy" />
        Duplicate{suffix}
      </button>
      <button
        type="button"
        onClick={deleteSelected}
        title="Delete (Delete key)"
        className={`${actionButton} border border-[#5a2b31] text-ed-danger hover:bg-[#2a1215]`}
      >
        <Icon name="trash" />
        Delete{suffix}
      </button>
    </div>
  );
}

function SingleObject({ node }: { node: SceneNode }) {
  const renameNode = useSceneStore((state) => state.renameNode);
  const setNodeVisible = useSceneStore((state) => state.setNodeVisible);
  const parentName = useSceneStore((state) =>
    node.parentId ? state.scene.nodes[node.parentId]?.name : undefined,
  );
  const [draft, setDraft] = useState(node.name);

  // Save on Enter or when the box loses focus. An empty or too long name is undone.
  function commitName() {
    const saved = renameNode(node.id, draft);
    setDraft(saved ?? node.name);
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-ed-line px-4 py-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-ed-select/13 text-ed-select">
          <KindIcon kind={node.kind} className="size-[22px]" />
        </span>
        <div className="min-w-0 flex-1">
          <input
            value={draft}
            maxLength={NODE_NAME_MAX_LENGTH}
            aria-label="Object name"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraft(node.name);
                event.currentTarget.blur();
              }
            }}
            className="-ml-2 h-[30px] w-full rounded-md border border-transparent bg-transparent px-2 text-[15px] font-semibold hover:border-ed-line-strong focus-visible:border-ed-accent focus-visible:outline-none"
          />
          <p className="text-xs text-ed-text-3">
            {KIND_LABELS[node.kind]} ·{" "}
            {parentName ? `inside ${parentName}` : "top level"}
          </p>
        </div>
        <button
          type="button"
          aria-label={`${node.visible ? "Hide" : "Show"} ${node.name}`}
          aria-pressed={!node.visible}
          title={node.visible ? "Hide" : "Show"}
          onClick={() => setNodeVisible(node.id, !node.visible)}
          className="grid size-[30px] shrink-0 place-items-center rounded-md text-ed-text-2 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent"
        >
          <Icon name={node.visible ? "eye" : "eyeOff"} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TransformSection node={node} />
        <AppearanceSection node={node} />
      </div>
      <Actions count={1} />
    </>
  );
}

function SeveralObjects({ ids }: { ids: string[] }) {
  const nodes = useSceneStore((state) => state.scene.nodes);
  const toggleSelect = useSceneStore((state) => state.toggleSelect);

  const selected = ids.flatMap((id) => (nodes[id] ? [nodes[id]] : []));
  const kinds = [...new Set(selected.map((node) => KIND_LABELS[node.kind]))];

  return (
    <>
      <div className="border-b border-ed-line px-4 py-3.5">
        <p className="text-[15px] font-semibold">
          {ids.length} objects selected
        </p>
        <p className="text-xs text-ed-text-3">{kinds.join(", ")}</p>
      </div>

      <h3 className="px-4 pt-3.5 pb-2 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase">
        In this selection
      </h3>
      <ul className="flex flex-wrap gap-1.5 px-4">
        {selected.map((node) => (
          <li
            key={node.id}
            className="flex h-7 items-center gap-1.5 rounded-full border border-ed-select/35 bg-ed-select/13 pr-1 pl-2.5 text-xs"
          >
            {node.name}
            <button
              type="button"
              aria-label={`Remove ${node.name} from the selection`}
              onClick={() => toggleSelect(node.id)}
              className="grid size-5 place-items-center rounded-full text-ed-text-2 hover:bg-white/10 hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent"
            >
              <Icon name="close" className="size-2.5" />
            </button>
          </li>
        ))}
      </ul>

      <p className="mx-4 mt-4 rounded-[10px] border border-ed-line bg-ed-field px-3.5 py-3 text-xs leading-relaxed text-ed-text-2">
        Drag the <b className="font-medium text-ed-text">gizmo</b> in the 3D
        view to move, rotate or scale all of them together. To change one
        object&apos;s values, select just that object.
      </p>
      <Actions count={ids.length} />
    </>
  );
}
