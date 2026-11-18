import {
  growSelection,
  invertSelection,
  loopOrRingSelection,
  outlineSelection,
  selectSimilar,
  shrinkSelection,
  type SelectionResult,
  type Topology,
} from "@sceneroom/shared";
import { getMesh } from "@/components/viewport/meshRegistry";
import { useEditStore } from "@/store/editStore";
import { useImportStore } from "@/store/importStore";
import { whyLoopStops } from "@sceneroom/shared";
import { topologyOfGeometry } from "./geometryTopology";

function say(tone: "error" | "info", text: string) {
  useImportStore.getState().setMessage({ tone, text });
}

/**
 * Selects the loop (the belt of edges round the shape) or the ring (the parallel edges across a strip) of
 * the edge that was clicked last. The result replaces the selection, so pressing Loop and then Ring shows the
 * loop and the ring of the same edge. Says what to do if there is no edge to start from, or why the loop or
 * ring stops right away. Returns true if the selection changed.
 */
export function selectLoopOrRing(pick: "loop" | "ring"): boolean {
  const { nodeId, selected, anchorEdge, setSelected } = useEditStore.getState();
  const geometry = nodeId
    ? (
        getMesh(nodeId) as
          { geometry?: Parameters<typeof topologyOfGeometry>[0] } | undefined
      )?.geometry
    : undefined;
  const topology = geometry ? topologyOfGeometry(geometry) : null;
  if (!topology) return false;

  const result = loopOrRingSelection(topology, selected, anchorEdge, pick);
  if (!result.ok) {
    say("error", result.reason);
    return false;
  }
  if (result.edges.length <= 1) {
    // Only the edge itself: say why, in the words of what is next to it
    const why = pick === "loop" ? whyLoopStops(topology, result.edge) : null;
    say(
      "info",
      pick === "loop"
        ? `This loop stops right away${why ? `: ${why}` : ""}. Try an edge in the middle of a side that has been cut into several squares (Segments 2 or more on the plain shape, before pressing Tab). For the rim of a lid: select the lid (face mode, Alt-click on it) and press Outline.`
        : "This ring stops right away: a ring runs across squares and stops at triangles and at the border of the shape. Try an edge in the middle of a side that has been cut into several squares.",
    );
    return false;
  }
  setSelected(result.points);
  return true;
}

/** Runs a selection tool on the mesh being edited and replaces the selection with its result. Says why if it cannot. */
function changeSelection(
  tool: (
    topology: Topology,
    selected: readonly number[],
    mode: "point" | "edge" | "face",
  ) => SelectionResult,
): boolean {
  const { nodeId, selected, selectMode, setSelected } = useEditStore.getState();
  const geometry = nodeId
    ? (
        getMesh(nodeId) as
          { geometry?: Parameters<typeof topologyOfGeometry>[0] } | undefined
      )?.geometry
    : undefined;
  const topology = geometry ? topologyOfGeometry(geometry) : null;
  if (!topology) return false;
  const result = tool(topology, selected, selectMode);
  if (!result.ok) {
    say("info", result.reason);
    return false;
  }
  setSelected(result.points);
  return true;
}

/** Select more: grows the selection by one step along the edges ( ] ). */
export const selectMore = () =>
  changeSelection((topology, selected) => growSelection(topology, selected));

/** Select less: shrinks the selection by one step ( [ ). */
export const selectLess = () =>
  changeSelection((topology, selected) => shrinkSelection(topology, selected));

/** Invert: selects what was not selected and the other way round. */
export const invertPointSelection = () =>
  changeSelection((topology, selected) => invertSelection(topology, selected));

/** Select similar: everything like the selection (faces facing the same way, edges of the same length, points with as many edges). */
export const selectSimilarToSelection = () => changeSelection(selectSimilar);

/** Outline: selects the edges round the selected faces (the rim of a lid, the border of a patch). */
export const selectOutline = () =>
  changeSelection((topology, selected) => outlineSelection(topology, selected));
