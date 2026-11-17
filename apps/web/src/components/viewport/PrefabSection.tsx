"use client";

import { type SceneNode } from "@sceneroom/shared";
import { editPrefab, makePrefab } from "@/store/libraryActions";
import { useImportStore } from "@/store/importStore";
import { useProjectStore } from "@/store/projectStore";
import { useSceneStore } from "@/store/sceneStore";

/** Tells the person why something was refused, in the bar over the 3D view. */
function tellProblem(text: string | null) {
  if (text) useImportStore.getState().setMessage({ tone: "error", text });
}

/** "Make prefab", next to the object's title: keeps the object in the project's Assets as a reusable prefab. */
export function MakePrefabButton({ node }: { node: SceneNode }) {
  return (
    <button
      type="button"
      title="Make a prefab from this object: keep it (and everything inside it) in the Assets tab, to place linked copies of it in any scene. This object becomes one of the copies."
      onClick={() => tellProblem(makePrefab(node.id))}
      className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-ed-accent hover:bg-ed-raised focus-visible:outline-2 focus-visible:outline-ed-accent"
    >
      Make prefab
    </button>
  );
}

/**
 * Shown under the title of a copy of a prefab: what it is, and how to change how every copy looks (Edit
 * prefab) or stop following it (Unlink).
 */
export function PrefabStrip({ node }: { node: SceneNode }) {
  const link = node.prefab;
  const prefabName = useProjectStore((state) =>
    link ? state.prefabs[link.id]?.name : undefined,
  );
  const unlinkPrefabNode = useSceneStore((state) => state.unlinkPrefabNode);
  if (!link) return null;

  const button =
    "rounded-md border border-ed-line-strong bg-ed-raised px-2.5 py-1 text-xs font-medium text-ed-text hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent";
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 border-b border-ed-line bg-ed-accent/8 px-4 py-2.5 text-xs text-ed-text-2"
    >
      <span
        className="min-w-0 flex-1"
        title="You can move, turn and scale this copy. How it looks follows the prefab."
      >
        <span aria-hidden="true" className="text-ed-accent">
          ◆{" "}
        </span>
        Copy of{" "}
        <strong className="text-ed-text">{prefabName ?? "(missing)"}</strong>
      </span>
      <button
        type="button"
        title="Open the prefab as a scene of its own. Changes show in every copy."
        onClick={() => tellProblem(editPrefab(link.id))}
        className={button}
      >
        Edit prefab
      </button>
      <button
        type="button"
        title="Make this an ordinary object that no longer follows the prefab"
        onClick={() => unlinkPrefabNode(node.id)}
        className={button}
      >
        Unlink
      </button>
    </div>
  );
}
