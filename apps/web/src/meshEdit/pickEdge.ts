import type { Camera, Object3D } from "three";
import { edgeVertices, edgesNear, type Topology } from "@sceneroom/shared";
import { visibleSpots } from "./visibility";

/** How many of the nearest edges are tested for being hidden (the ones further down the list are never reached in practice). */
const MAX_CANDIDATES = 40;

/**
 * The edge under a spot on the screen: the nearest one within `maxDistance` pixels, and without X-ray the
 * nearest one whose middle the camera can SEE (not one on a face turned away). -1 if there is none.
 * `projected` is where every point of the mesh is on the screen.
 */
export function pickEdge(
  topology: Topology,
  projected: Float32Array,
  x: number,
  y: number,
  maxDistance: number,
  xray: boolean,
  object: Object3D,
  camera: Camera,
): number {
  const near = edgesNear(topology, projected, x, y, maxDistance).slice(
    0,
    MAX_CANDIDATES,
  );
  const seen = xray
    ? near.map(() => true)
    : visibleSpots(
        near.map((e) => {
          const [a, b] = edgeVertices(topology, e);
          const p = topology.vertexPositions;
          return [
            (p[a * 3]! + p[b * 3]!) / 2,
            (p[a * 3 + 1]! + p[b * 3 + 1]!) / 2,
            (p[a * 3 + 2]! + p[b * 3 + 2]!) / 2,
          ] as const;
        }),
        object,
        camera,
      );
  return near.find((_, i) => seen[i]) ?? -1;
}
