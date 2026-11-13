"use client";

import { useState } from "react";
import { NODE_NAME_MAX_LENGTH, type SceneNode } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { overlayButton } from "./buttonStyle";

/** Name box plus Duplicate and Delete for the selected object. Hidden when nothing is selected. */
export default function SelectionPanel() {
  const node = useSceneStore((state) =>
    state.selectedId ? (state.scene.nodes[state.selectedId] ?? null) : null,
  );
  if (!node) return null;
  // key: start with a fresh text box whenever a different object is selected
  return <PanelContent key={node.id} node={node} />;
}

function PanelContent({ node }: { node: SceneNode }) {
  const renameNode = useSceneStore((state) => state.renameNode);
  const duplicateSelected = useSceneStore((state) => state.duplicateSelected);
  const deleteSelected = useSceneStore((state) => state.deleteSelected);
  const [draft, setDraft] = useState(node.name);

  // Save on Enter or when the box loses focus. An empty or too long name is undone.
  function commitName() {
    const saved = renameNode(node.id, draft);
    setDraft(saved ?? node.name);
  }

  return (
    <div
      role="group"
      aria-label="Selected object"
      className="absolute top-3 right-3 flex w-60 flex-col gap-2 rounded-lg bg-zinc-900/90 p-3 text-zinc-200 shadow-lg"
    >
      <label className="flex flex-col gap-1 text-xs tracking-wide text-zinc-400 uppercase">
        Name
        <input
          value={draft}
          maxLength={NODE_NAME_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(node.name);
              event.currentTarget.blur();
            }
          }}
          className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 normal-case focus-visible:outline-2 focus-visible:outline-sky-400"
        />
      </label>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={duplicateSelected}
          className={`${overlayButton} flex-1 border border-zinc-600 hover:bg-zinc-700`}
        >
          Duplicate (Ctrl/Cmd+D)
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          className={`${overlayButton} border border-red-700 text-red-300 hover:bg-red-950`}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
