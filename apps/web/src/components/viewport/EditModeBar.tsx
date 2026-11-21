"use client";

import { useState } from "react";
import {
  activeOperation,
  useEditStore,
  type SelectMode,
} from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";
import { useViewStore } from "@/store/viewStore";
import { setChecker } from "./checkerView";
import {
  CREASE_SHARP,
  CREASE_SOFT,
  creaseSelectedEdges,
  seamSelectedEdges,
  unwrapMesh,
  unwrapMeshAlongSeams,
  deleteSelectedPoints,
  extrudeSelectedFaces,
  bevelSelectedEdges,
  simplifyEditedMesh,
  divideSelectedFaces,
  bridgeSelectedLoops,
  fillSelectedHole,
  flipSelectedNormals,
  mergeSelectedPoints,
  weldSelectedPoints,
  insetSelectedFaces,
} from "@/meshEdit/editOperations";
import {
  invertPointSelection,
  selectLess,
  selectLoopOrRing,
  selectMore,
  selectOutline,
  selectSimilarToSelection,
} from "@/meshEdit/selectionTools";
import ExtrudePanel from "./ExtrudePanel";
import BevelPanel from "./BevelPanel";
import DividePanel from "./DividePanel";
import LoopCutPanel from "./LoopCutPanel";
import { hideOthers, hideSelection, showAll } from "@/meshEdit/hideShow";
import { shrinkwrapTargets, shrinkwrapToObject } from "@/meshEdit/shrinkwrap";
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
  const hidden = useEditStore((state) => state.hidden);
  const scene = useSceneStore((state) => state.scene);
  const [shrinkTarget, setShrinkTarget] = useState("");
  const targets = nodeId ? shrinkwrapTargets(scene, nodeId) : [];
  // A target that was deleted is no longer chosen
  const target = targets.some((t) => t.id === shrinkTarget) ? shrinkTarget : "";
  const uvWindow = useEditStore((state) => state.uvWindow);
  const setUvWindow = useEditStore((state) => state.setUvWindow);
  const checker = useViewStore((state) =>
    nodeId ? state.checkerIds.has(nodeId) : false,
  );
  const setXray = useEditStore((state) => state.setXray);
  const loopCutMode = useEditStore((state) => state.loopCutMode);
  const setLoopCutMode = useEditStore((state) => state.setLoopCutMode);
  const node = useSceneStore((state) =>
    nodeId ? state.scene.nodes[nodeId] : undefined,
  );
  // A settings panel is open until something else is done (the undo history grew)
  const pastLength = useSceneStore((state) => state.history.past.length);
  const session = useEditStore((state) => activeOperation(state, pastLength));
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
          <span className="text-ed-text-3">Adjust</span>
          <button
            type="button"
            onClick={() => selectMore()}
            disabled={selected.length === 0}
            title="More: grow the selection by one step along the edges (])"
            className={ACTION}
          >
            More
          </button>
          <button
            type="button"
            onClick={() => selectLess()}
            disabled={selected.length === 0}
            title="Less: shrink the selection by one step ([)"
            className={ACTION}
          >
            Less
          </button>
          <button
            type="button"
            onClick={() => invertPointSelection()}
            title="Invert: select what is not selected, and unselect what is"
            className={ACTION}
          >
            Invert
          </button>
          <button
            type="button"
            onClick={() => selectOutline()}
            disabled={selected.length === 0}
            title="Outline: select the edges round the selected faces. To get the rim of a lid: press 3, Alt-click the lid, then press Outline."
            className={ACTION}
          >
            Outline
          </button>
          <button
            type="button"
            onClick={() => selectSimilarToSelection()}
            disabled={selected.length === 0}
            title="Similar: select everything like what is selected: faces facing the same way (Faces mode), edges of the same length (Edges mode), points where as many edges meet (Points mode)"
            className={ACTION}
          >
            Similar
          </button>
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
          <button
            type="button"
            onClick={() => void hideSelection()}
            disabled={selected.length === 0}
            title="Hide: take the selected parts out of view and out of reach, to work on what is behind them (H). In Faces mode a whole face must be selected. The mesh is not changed."
            className={ACTION}
          >
            Hide
          </button>
          <button
            type="button"
            onClick={() => void hideOthers()}
            disabled={selected.length === 0}
            title="Hide others: show only the selected parts (Shift + H)"
            className={ACTION}
          >
            Hide others
          </button>
          <button
            type="button"
            onClick={() => showAll()}
            disabled={!hidden}
            title="Show all: bring back everything that was hidden, and select it (Alt + H)"
            className={ACTION}
          >
            Show all
          </button>
          <button
            type="button"
            aria-pressed={checker}
            onClick={() => nodeId && setChecker(nodeId, !checker)}
            title="UV checker: draw a checkerboard on the object instead of its colour, to see how the texture map lies on it. Equal, square cells mean a good map."
            className={`rounded-md border px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-ed-accent ${
              checker
                ? "border-ed-select/60 bg-ed-select/25 text-ed-select"
                : "border-ed-line-strong hover:bg-ed-field"
            }`}
          >
            Checker
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
          <span className="text-ed-text-3">UV</span>
          <button
            type="button"
            onClick={() => void unwrapMesh()}
            title="Unwrap: lay the surface flat, like a sewing pattern, and give the mesh a UV map. Needs no seams (marked seams are respected). Replaces an earlier map."
            className={ACTION}
          >
            Unwrap
          </button>
          <button
            type="button"
            onClick={() => void unwrapMeshAlongSeams()}
            title="Unwrap along seams: lay each piece of the surface flat along the seams you marked, keeping angles so a texture does not shear. Cut the shape open with Mark seam first: a closed shape cannot be laid flat (a cylinder with lids needs a seam round its top edge, round its bottom edge and one down its side)."
            className={ACTION}
          >
            Along seams
          </button>
          <button
            type="button"
            aria-pressed={uvWindow}
            onClick={() => setUvWindow(!uvWindow)}
            title="UV window: show the flat map of the mesh in the corner of the 3D view"
            className={`rounded-md border px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-ed-accent ${
              uvWindow
                ? "border-ed-select/60 bg-ed-select/25 text-ed-select"
                : "border-ed-line-strong hover:bg-ed-field"
            }`}
          >
            UV window
          </button>
          <button
            type="button"
            onClick={() => void seamSelectedEdges(true)}
            disabled={selected.length < 2}
            title="Mark seam: mark the selected edges as seams, the cuts along which the surface will be laid flat for a UV map (drawn in red). Select an edge first."
            className={ACTION}
          >
            Mark seam
          </button>
          <button
            type="button"
            onClick={() => void seamSelectedEdges(false)}
            disabled={selected.length < 2}
            title="Clear seam: take the seam off the selected edges"
            className={ACTION}
          >
            Clear seam
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
            onClick={() => void divideSelectedFaces()}
            title="Divide: cut the selected faces into smaller ones, evenly, without changing the shape. With nothing selected the whole object is divided. This is the way to add segments to a mesh."
            className={ACTION}
          >
            Divide
          </button>
          <button
            type="button"
            onClick={() => void simplifyEditedMesh()}
            title="Simplify: cut the whole mesh down to about half its triangles, keeping the shape (flat areas lose the most). Points on open borders and hard edges stay put. Removes the UV map, creases and seams. Press again for half of that."
            className={ACTION}
          >
            Simplify
          </button>
          <span className="flex items-center gap-1">
            <select
              aria-label="Object to wrap onto"
              value={target}
              onChange={(event) => setShrinkTarget(event.target.value)}
              className="max-w-[9rem] rounded-md border border-ed-line-strong bg-ed-field px-1.5 py-1"
            >
              <option value="">Wrap onto…</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!target}
              onClick={() => void shrinkwrapToObject(target)}
              title="Shrinkwrap: stretch the mesh over the chosen object. Every selected point (all points when none are selected) is pushed straight out from the middle of the mesh until it meets the surface of the chosen object, so a small mesh covers it. A point whose line misses it goes to the closest spot instead."
              className={ACTION}
            >
              Shrinkwrap
            </button>
          </span>
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
      {session ? (
        <div>
          <LoopCutPanel />
          <BevelPanel />
          <DividePanel />
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
