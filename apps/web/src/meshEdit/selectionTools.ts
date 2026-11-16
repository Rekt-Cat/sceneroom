import { growSelection } from "@sceneroom/shared";
import { getMesh } from "@/components/viewport/meshRegistry";
import { useEditStore } from "@/store/editStore";
import { useImportStore } from "@/store/importStore";
import { topologyOfGeometry } from "./geometryTopology";

/**
 * Grows the selected edges to their whole loops (the ring of edges round the shape) or rings (the parallel
 * edges across a strip). Says what to do if no edge is selected. Returns true if the selection changed.
 */
export function growSelectionTo(pick: "loop" | "ring"): boolean {
  const { nodeId, selected, setSelected } = useEditStore.getState();
  const geometry = nodeId
    ? (
        getMesh(nodeId) as
          { geometry?: Parameters<typeof topologyOfGeometry>[0] } | undefined
      )?.geometry
    : undefined;
  const topology = geometry ? topologyOfGeometry(geometry) : null;
  const grown = topology ? growSelection(topology, selected, pick) : null;
  if (!grown) {
    useImportStore.getState().setMessage({
      tone: "error",
      text: "Select an edge first: press 2 for edge mode, then click an edge.",
    });
    return false;
  }
  if (grown.length === selected.length) {
    // Nothing was added: the loop or ring is just the edge that is already selected
    useImportStore.getState().setMessage({
      tone: "info",
      text:
        pick === "loop"
          ? "This loop stops right away. A loop runs through squares and stops at triangles and at corners where 3 or 5 edges meet (a cube's corner, the tip of a sphere). Try an edge in the middle of a flat side that has been cut into several squares."
          : "This ring stops right away. A ring runs across squares and stops at triangles and at the border of the shape. Try an edge in the middle of a flat side that has been cut into several squares.",
    });
    return false;
  }
  setSelected(grown);
  return true;
}
