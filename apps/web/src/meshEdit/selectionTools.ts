import { loopOrRingSelection } from "@sceneroom/shared";
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
        ? `This loop stops right away${why ? `: ${why}` : ""}. Try an edge in the middle of a side that has been cut into several squares (Segments 2 or more on the plain shape, before pressing Tab).`
        : "This ring stops right away: a ring runs across squares and stops at triangles and at the border of the shape. Try an edge in the middle of a side that has been cut into several squares.",
    );
    return false;
  }
  setSelected(result.points);
  return true;
}
