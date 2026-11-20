import {
  buildTopology,
  checkMesh,
  expandToWelded,
  translateSelected,
  uvIslands,
  uvStretch,
  weldGroups,
} from "@sceneroom/shared";
import { loadMeshData } from "@/assets/meshStorage";
import { commitMeshPositions } from "@/meshEdit/commitMeshEdit";
import type { Mesh } from "three";
import { getMesh } from "@/components/viewport/meshRegistry";
import { useEditStore } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";

/** What the browser tests may ask about the mesh being edited (or the one selected object). */
export type MeshFacts = {
  /** What is wrong with the mesh in plain words, or null if it is fine. */
  problem: string | null;
  points: number;
  triangles: number;
  /** Edges with only one face: 0 for a closed shape. */
  openEdges: number;
  /** Edges with more than two faces. */
  crowdedEdges: number;
  /** Where the first few open or crowded edges are (x, y, z of both ends), to explain a failure. */
  badEdges: string[];
  hasUvs: boolean;
  /** Pieces of the map, and faces that are turned over on it. */
  uvPieces: number;
  uvFolded: number;
  /** How much of the 0 to 1 square the map covers (the sum of the face areas on the map). */
  uvArea: number;
  /** The largest stretch of any face on the map, 0 (none) to 1. */
  uvWorstStretch: number;
  seams: number;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
};

/**
 * A seam for the browser tests (Playwright): ways to read facts about the mesh and to select points by where they are,
 * because clicking exact faces in a 3D view by pixel would be fragile. Everything under test still goes through the
 * real buttons; this only sets up the selection and reads results. Not installed in a production build.
 */
export type SceneRoomHooks = {
  /** Facts about the mesh being edited, or the single selected mesh object. Null if there is none. */
  meshFacts: () => Promise<MeshFacts | null>;
  /** Selects the points of the edited mesh that lie inside a box (in the mesh's own space), with the points on the same spots. Returns how many. */
  selectBox: (
    min: [number, number, number],
    max: [number, number, number],
  ) => Promise<number>;
  /** Moves the selected points of the edited mesh by a distance (the way dragging the gizmo does: one stored change). */
  moveSelected: (delta: [number, number, number]) => Promise<boolean>;
  /** What is hidden in edit mode: the hidden triangle count, the triangles still drawn, and how many points are selected. */
  hiddenFacts: () => {
    hidden: number;
    drawn: number;
    selected: number;
  } | null;
  /** Sets the colour of the selected object (a hex colour). */
  setColor: (hex: string) => void;
  /** Sets the position, rotation (degrees) and scale of the selected object. */
  setTransform: (change: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  }) => void;
};

declare global {
  interface Window {
    __sceneroom?: SceneRoomHooks;
  }
}

/** The sum of the face areas on the map (0 when there is no map). */
function mapArea(uvs: Float32Array | undefined, indices: Uint32Array): number {
  if (!uvs) return 0;
  let total = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    total +=
      Math.abs(
        (uvs[b * 2]! - uvs[a * 2]!) * (uvs[c * 2 + 1]! - uvs[a * 2 + 1]!) -
          (uvs[c * 2]! - uvs[a * 2]!) * (uvs[b * 2 + 1]! - uvs[a * 2 + 1]!),
      ) / 2;
  }
  return total;
}

/** The mesh object the tests talk about: the one being edited, else the single selected one. */
function targetAssetId(): string | null {
  const { nodeId } = useEditStore.getState();
  const { scene, selectedIds } = useSceneStore.getState();
  const id = nodeId ?? (selectedIds.length === 1 ? selectedIds[0]! : null);
  const node = id ? scene.nodes[id] : undefined;
  return node?.kind === "mesh" && node.assetId ? node.assetId : null;
}

/** Puts the hooks on `window` (never in production). Returns a function that takes them off again. */
export function installTestHooks(): () => void {
  if (process.env.NODE_ENV === "production") return () => undefined;
  window.__sceneroom = {
    async meshFacts() {
      const assetId = targetAssetId();
      if (!assetId) return null;
      const mesh = await loadMeshData(assetId);
      const topology = buildTopology(mesh);
      const faces = topology.edgeFaces;
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < mesh.positions.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k]!, mesh.positions[i + k]!);
          max[k] = Math.max(max[k]!, mesh.positions[i + k]!);
        }
      }
      const stretch = mesh.uvs ? uvStretch(mesh) : null;
      const at = (v: number) =>
        [0, 1, 2]
          .map((k) => topology.vertexPositions[v * 3 + k]!.toFixed(2))
          .join(",");
      const badEdges: string[] = [];
      faces.forEach((f, e) => {
        if (f.length === 2 || badEdges.length >= 6) return;
        badEdges.push(
          `${f.length === 1 ? "open" : `${f.length} faces`}: (${at(topology.edges[e * 2]!)}) to (${at(topology.edges[e * 2 + 1]!)})`,
        );
      });
      return {
        problem: checkMesh(mesh),
        points: mesh.positions.length / 3,
        triangles: mesh.indices.length / 3,
        openEdges: faces.filter((f) => f.length === 1).length,
        crowdedEdges: faces.filter((f) => f.length > 2).length,
        badEdges,
        hasUvs: mesh.uvs !== undefined,
        uvPieces: mesh.uvs ? uvIslands(mesh).count : 0,
        uvFolded: stretch?.folded ?? 0,
        uvArea: mapArea(mesh.uvs, mesh.indices),
        uvWorstStretch: stretch
          ? stretch.values.reduce((m, v) => Math.max(m, v), 0)
          : 0,
        seams: mesh.seams?.length ?? 0,
        boundsMin: min,
        boundsMax: max,
      };
    },
    async selectBox(min, max) {
      const assetId = targetAssetId();
      if (!assetId) return 0;
      const mesh = await loadMeshData(assetId);
      const inside: number[] = [];
      for (let p = 0; p < mesh.positions.length / 3; p++) {
        let ok = true;
        for (let k = 0; k < 3; k++) {
          const v = mesh.positions[p * 3 + k]!;
          // A little slack: 0.1 is not exactly 0.1 in the stored 32-bit numbers
          if (v < min[k]! - 1e-4 || v > max[k]! + 1e-4) ok = false;
        }
        if (ok) inside.push(p);
      }
      const welded = expandToWelded(weldGroups(mesh.positions), inside);
      useEditStore.getState().setSelected(welded);
      return welded.length;
    },
    async moveSelected(delta) {
      const { nodeId, selected } = useEditStore.getState();
      const assetId = targetAssetId();
      if (!nodeId || !assetId) return false;
      const mesh = await loadMeshData(assetId);
      const positions = translateSelected(mesh.positions, selected, delta);
      return commitMeshPositions(nodeId, positions, "Move points");
    },
    hiddenFacts() {
      const { nodeId, hidden, selected } = useEditStore.getState();
      const geometry = nodeId
        ? (getMesh(nodeId) as Mesh | undefined)?.geometry
        : undefined;
      if (!geometry) return null;
      return {
        hidden: hidden?.triangles.length ?? 0,
        drawn: (geometry.index?.count ?? 0) / 3,
        selected: selected.length,
      };
    },
    setColor(hex) {
      const { selectedIds, setNodeColor } = useSceneStore.getState();
      const id = useEditStore.getState().nodeId ?? selectedIds[0];
      if (id) setNodeColor(id, hex);
    },
    setTransform(change) {
      const { scene, selectedIds, setNodeTransform } = useSceneStore.getState();
      const id = useEditStore.getState().nodeId ?? selectedIds[0];
      const node = id ? scene.nodes[id] : undefined;
      if (!id || !node) return;
      setNodeTransform(id, { ...node.transform, ...change });
    },
  };
  return () => {
    delete window.__sceneroom;
  };
}
