"use client";

import { useEditStore } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";
import {
  deleteSelectedPoints,
  extrudeSelectedFaces,
} from "@/meshEdit/editOperations";
import { stopEditing } from "@/meshEdit/startEditing";

const ACTION =
  "rounded-md border border-ed-line-strong px-2 py-0.5 font-medium hover:bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

/** The strip at the top of the 3D view while editing points: what is going on and how to get out. */
export default function EditModeBar() {
  const nodeId = useEditStore((state) => state.nodeId);
  const selected = useEditStore((state) => state.selected);
  const node = useSceneStore((state) =>
    nodeId ? state.scene.nodes[nodeId] : undefined,
  );
  const points = useSceneStore((state) => {
    if (!node?.assetId) return 0;
    const info = state.scene.assets[node.assetId];
    return info ? info.triangles : 0;
  });
  if (!nodeId || !node) return null;
  return (
    <div
      role="status"
      className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-ed-select/50 bg-ed-raised/95 px-3 py-1.5 text-xs shadow-lg shadow-black/40"
    >
      <span className="font-semibold text-ed-select">Edit mode</span>
      <span className="text-ed-text-2">
        {node.name} · {selected.length} point{selected.length === 1 ? "" : "s"}{" "}
        selected
        {points > 0 ? ` · ${points.toLocaleString("en-US")} triangles` : ""}
      </span>
      <span className="hidden text-ed-text-3 lg:inline">
        Click a point · Alt-click a face · Shift adds · Ctrl-drag a box · A all
        · W E R
      </span>
      <button
        type="button"
        onClick={() => void extrudeSelectedFaces()}
        disabled={selected.length < 3}
        title="Extrude: copy the selected faces and push them out (Shift + E). Select all the points of a face first."
        className={ACTION}
      >
        Extrude
      </button>
      <button
        type="button"
        onClick={() => void deleteSelectedPoints()}
        disabled={selected.length === 0}
        title="Delete the selected points and the faces that use them (Delete)"
        className={ACTION}
      >
        Delete
      </button>
      <button
        type="button"
        onClick={stopEditing}
        title="Leave edit mode (Tab or Escape)"
        className="rounded-md border border-ed-line-strong px-2 py-0.5 font-medium hover:bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        Done
      </button>
    </div>
  );
}
