"use client";

import { useEditStore, type SelectMode } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";
import {
  CREASE_SHARP,
  CREASE_SOFT,
  creaseSelectedEdges,
  deleteSelectedPoints,
  extrudeSelectedFaces,
  bevelSelectedEdges,
  bridgeSelectedLoops,
  fillSelectedHole,
  flipSelectedNormals,
  mergeSelectedPoints,
  weldSelectedPoints,
  insetSelectedFaces,
} from "@/meshEdit/editOperations";
import { selectLoopOrRing } from "@/meshEdit/selectionTools";
import ExtrudePanel from "./ExtrudePanel";
import BevelPanel from "./BevelPanel";
import LoopCutPanel from "./LoopCutPanel";
import { stopEditing } from "@/meshEdit/startEditing";

const ACTION =
  "rounded-md border border-ed-line-strong px-2.5 py-1 font-medium hover:bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

const MODES: { mode: SelectMode; label: string; key: string; help: string }[] =
  [
    {
      mode: "point",
      label: "Points",
      key: "1",
      help: "Click a corner point. Alt-click selects a whole flat face.",
    },
    {
      mode: "edge",
      label: "Edges",
      key: "2",
      help: "Click an edge (a line between two points). Alt-click selects its whole loop.",
    },
    {
      mode: "face",
      label: "Faces",
      key: "3",
      help: "Click a face (a flat surface). A square made of two triangles is one face.",
    },
  ];

/** What to do next, in plain words, for the mode that is on. */
const HINTS: Record<SelectMode, string> = {
  point:
    "Click a point to select it. Shift adds more. Ctrl-drag draws a box. Alt-click selects a whole flat face. Then move it with W, turn with E, scale with R.",
  edge: "Click an edge to select it. Then press Loop for the whole belt of edges round the shape (Alt-click does the same in one go), or Ring for the parallel edges across a strip. Both work from the edge you clicked, so you can press one and then the other to compare. Shift adds more.",
  face: "Click a face to select it. Shift adds more. Alt-click selects the whole flat area. Press Extrude to push the selected faces out (or in, with a negative distance), or Inset to make a smaller face inside them.",
};

/**
 * The panel at the top of the 3D view while editing points: what is being edited, what a click selects,
 * the tools that grow a selection, and what to do next in plain words.
 */
export default function EditTools() {
  const nodeId = useEditStore((state) => state.nodeId);
  const selected = useEditStore((state) => state.selected);
  const selectMode = useEditStore((state) => state.selectMode);
  const setSelectMode = useEditStore((state) => state.setSelectMode);
  const xray = useEditStore((state) => state.xray);
  const setXray = useEditStore((state) => state.setXray);
  const loopCutMode = useEditStore((state) => state.loopCutMode);
  const setLoopCutMode = useEditStore((state) => state.setLoopCutMode);
  const node = useSceneStore((state) =>
    nodeId ? state.scene.nodes[nodeId] : undefined,
  );
  // A settings panel is open until something else is done (the undo history grew)
  const pastLength = useSceneStore((state) => state.history.past.length);
  const session = useEditStore(
    (state) => state.loopCut ?? state.bevel ?? state.extrude,
  );
  if (!nodeId || !node) return null;

  /** Loop and Ring work on edges, so pressing them switches to edge mode (and says what to do if nothing is selected). */
  function grow(pick: "loop" | "ring") {
    setSelectMode("edge");
    selectLoopOrRing(pick);
  }

  return (
    <div
      role="region"
      aria-label="Edit mode"
      className="flex flex-col gap-2 rounded-md border border-ed-select/40 bg-ed-field/30 p-2.5 text-xs"
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ed-text-3">Select</span>
          <div
            role="group"
            aria-label="What a click selects"
            className="flex overflow-hidden rounded-md border border-ed-line-strong"
          >
            {MODES.map(({ mode, label, key, help }) => (
              <button
                key={mode}
                type="button"
                aria-pressed={selectMode === mode}
                title={`${help} (press ${key})`}
                onClick={() => setSelectMode(mode)}
                className={`flex items-center gap-1.5 px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-ed-accent ${
                  selectMode === mode
                    ? "bg-ed-select/25 text-ed-select"
                    : "hover:bg-ed-field"
                }`}
              >
                {label}
                <kbd className="rounded bg-ed-field px-1 font-mono text-[10px] text-ed-text-3">
                  {key}
                </kbd>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ed-text-3">View</span>
          <button
            type="button"
            aria-pressed={xray}
            onClick={() => setXray(!xray)}
            title={
              xray
                ? "X-ray is ON: lines and points on the far side show through the solid, and can be picked. Press to hide them (Alt + Z)."
                : "X-ray is off: lines and points on faces the camera cannot see are hidden, and cannot be picked. Press to see through the solid (Alt + Z)."
            }
            className={`rounded-md border px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-ed-accent ${
              xray
                ? "border-ed-select/60 bg-ed-select/25 text-ed-select"
                : "border-ed-line-strong hover:bg-ed-field"
            }`}
          >
            X-ray
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ed-text-3">Edge</span>
          <button
            type="button"
            onClick={() => grow("loop")}
            title="Select the whole loop through the edge you clicked: the belt of edges that runs round the shape (Alt-click an edge does the same). Click an edge first."
            className={ACTION}
          >
            Loop
          </button>
          <button
            type="button"
            onClick={() => grow("ring")}
            title="Select the ring through the edge you clicked: the parallel edges across the same strip, like the rungs of a ladder. Click an edge first."
            className={ACTION}
          >
            Ring
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ed-text-3">Crease</span>
          <button
            type="button"
            onClick={() => void creaseSelectedEdges(CREASE_SHARP)}
            disabled={selected.length < 2}
            title="Crease: mark the selected edges as sharp, so the Smooth modifier keeps them crisp instead of rounding them (Shift + C). Creased edges are drawn in pink. Select edges first: press 2, click an edge, or Alt-click a loop."
            className={ACTION}
          >
            Sharp
          </button>
          <button
            type="button"
            onClick={() => void creaseSelectedEdges(CREASE_SOFT)}
            disabled={selected.length < 2}
            title="A softer crease: crisp at first, then rounding off as the shape is smoothed more."
            className={ACTION}
          >
            Soft
          </button>
          <button
            type="button"
            onClick={() => void creaseSelectedEdges(0)}
            disabled={selected.length < 2}
            title="Remove the crease from the selected edges"
            className={ACTION}
          >
            Clear
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ed-text-3">Change</span>
          <button
            type="button"
            aria-pressed={loopCutMode}
            onClick={() => setLoopCutMode(!loopCutMode)}
            title="Loop cut: add a new ring of edges. Move over an edge to see where the cut goes (green), then click (C). Esc cancels."
            className={`rounded-md border px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-ed-accent ${
              loopCutMode
                ? "border-ed-select/60 bg-ed-select/25 text-ed-select"
                : "border-ed-line-strong hover:bg-ed-field"
            }`}
          >
            Loop cut
          </button>
          <button
            type="button"
            onClick={() => void bevelSelectedEdges()}
            disabled={selected.length < 2}
            title="Bevel: round off or chamfer the selected edges so they catch the light (B). Select an edge first."
            className={ACTION}
          >
            Bevel
          </button>
          <button
            type="button"
            onClick={() => void insetSelectedFaces()}
            disabled={selected.length < 3}
            title="Inset: make a smaller copy of the selected faces inside them, with a border round it (I). Then push it out or in. Select a face first."
            className={ACTION}
          >
            Inset
          </button>
          <button
            type="button"
            onClick={() => void extrudeSelectedFaces()}
            disabled={selected.length < 2}
            title="Extrude: copy the selected faces (or edges) and push them out (Shift + E). Select a face or an edge first."
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ed-text-3">Fix up</span>
          <button
            type="button"
            onClick={() => void mergeSelectedPoints()}
            disabled={selected.length < 2}
            title="Merge: join the selected points into one point in the middle of them. Faces between them disappear. Select two or more points first."
            className={ACTION}
          >
            Merge
          </button>
          <button
            type="button"
            onClick={() => void weldSelectedPoints()}
            disabled={selected.length < 2}
            title="Weld: join selected points that are almost on top of each other (closes a seam, removes doubled points). The surface is then shaded smoothly across the join."
            className={ACTION}
          >
            Weld
          </button>
          <button
            type="button"
            onClick={() => void flipSelectedNormals()}
            title="Flip: turn the selected faces inside out. With nothing selected the whole object is flipped. Use it when a surface looks dark or see-through from the front."
            className={ACTION}
          >
            Flip
          </button>
          <button
            type="button"
            onClick={() => void fillSelectedHole()}
            title="Fill hole: close an opening. Select one edge on the border of the hole (2 for edge mode, click it), then press this."
            className={ACTION}
          >
            Fill hole
          </button>
          <button
            type="button"
            onClick={() => void bridgeSelectedLoops()}
            disabled={selected.length < 4}
            title="Bridge: join two open rims with a strip of faces (the ends of two pipes). Select an edge on each rim (Shift-click the second); both need the same number of edges."
            className={ACTION}
          >
            Bridge
          </button>
        </div>
      </div>

      {/* The settings of the last operation take the place of the hint, in a narrow column, so the bar stays small */}
      {session && session.pastLength === pastLength ? (
        <div>
          <LoopCutPanel />
          <BevelPanel />
          <ExtrudePanel />
        </div>
      ) : (
        <p className="text-[11px] leading-relaxed text-ed-text-3">
          {loopCutMode
            ? "Loop cut: move over an edge. A green line shows where the new ring of edges will go, all the way across the strip of squares. Click to cut. Esc cancels."
            : HINTS[selectMode]}
        </p>
      )}
    </div>
  );
}

/**
 * The one-line note over the 3D view while editing: what is being edited and how many points are selected.
 * The tools themselves are in the right-hand panel (`EditTools`), so they do not cover the scene.
 */
export function EditStatus() {
  const nodeId = useEditStore((state) => state.nodeId);
  const count = useEditStore((state) => state.selected.length);
  const name = useSceneStore((state) =>
    nodeId ? state.scene.nodes[nodeId]?.name : undefined,
  );
  if (!nodeId || name === undefined) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-ed-select/50 bg-ed-raised/95 px-3 py-1.5 text-xs shadow-lg shadow-black/40"
    >
      <span className="font-semibold text-ed-select">Edit mode</span>
      <span className="text-ed-text-2">
        {name} · {count} point{count === 1 ? "" : "s"} selected
      </span>
      <button
        type="button"
        onClick={stopEditing}
        title="Leave edit mode (Tab or Escape)"
        className={ACTION}
      >
        Done
      </button>
    </div>
  );
}
