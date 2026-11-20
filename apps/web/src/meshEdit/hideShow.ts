import {
  hiddenPoints,
  topologyFingerprint,
  trianglesToHide,
  trianglesToHideOthers,
  unionTriangles,
} from "@sceneroom/shared";
import { loadMeshData } from "@/assets/meshStorage";
import { useEditStore } from "@/store/editStore";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";

/** The whole stored mesh of the object being edited (hidden parts included), or null. */
async function wholeMesh() {
  const { nodeId } = useEditStore.getState();
  const node = nodeId
    ? useSceneStore.getState().scene.nodes[nodeId]
    : undefined;
  if (!node?.assetId || node.kind !== "mesh") return null;
  try {
    return await loadMeshData(node.assetId);
  } catch (error) {
    console.error("Reading the mesh to hide parts failed:", error);
    useImportStore.getState().setMessage({
      tone: "error",
      text: "Could not read the mesh. Please try again.",
    });
    return null;
  }
}

/** Remembers the hidden triangles (with the points they leave bare) and drops the selection of what is gone. */
function remember(
  triangles: readonly number[],
  indices: Uint32Array,
  pointCount: number,
): void {
  const edit = useEditStore.getState();
  const points = hiddenPoints(indices, new Set(triangles), pointCount);
  const gone = new Set(points);
  edit.setHidden({
    triangles: [...triangles],
    points,
    fingerprint: topologyFingerprint(indices, pointCount),
  });
  edit.setSelected(edit.selected.filter((p) => !gone.has(p)));
}

/**
 * Hide: takes the selected parts out of view and out of reach (see `trianglesToHide`). Parts hidden earlier stay
 * hidden. The mesh is not changed, so it is not an undo step.
 */
export async function hideSelection(): Promise<boolean> {
  return hide((mesh, edit) =>
    trianglesToHide(mesh.indices, edit.selected, edit.selectMode),
  );
}

/** Hide others: keeps only the selected parts in view. */
export async function hideOthers(): Promise<boolean> {
  return hide((mesh, edit) =>
    trianglesToHideOthers(mesh.indices, edit.selected, edit.selectMode),
  );
}

async function hide(
  pick: (
    mesh: { indices: Uint32Array },
    edit: ReturnType<typeof useEditStore.getState>,
  ) => number[],
): Promise<boolean> {
  const edit = useEditStore.getState();
  if (edit.selected.length === 0) {
    useImportStore.getState().setMessage({
      tone: "info",
      text: "Select some points, edges or faces first, then hide them.",
    });
    return false;
  }
  const mesh = await wholeMesh();
  if (!mesh) return false;
  const now = pick(mesh, edit);
  if (now.length === 0) {
    useImportStore.getState().setMessage({
      tone: "info",
      text: "Nothing to hide: in Edges and Faces mode a whole face has to be selected.",
    });
    return false;
  }
  const before = useEditStore.getState().hidden;
  const all = unionTriangles(before?.triangles ?? [], now);
  remember(all, mesh.indices, mesh.positions.length / 3);
  return true;
}

/** Show all: brings every hidden part back, and selects the points that were hidden so they can be seen at once. */
export function showAll(): boolean {
  const edit = useEditStore.getState();
  const hidden = edit.hidden;
  if (!hidden) return false;
  edit.setHidden(null);
  edit.setSelected(hidden.points);
  return true;
}
