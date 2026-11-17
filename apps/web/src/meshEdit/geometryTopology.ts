import type { BufferAttribute, BufferGeometry } from "three";
import {
  buildTopology,
  type Crease,
  type EditMesh,
  type Topology,
} from "@sceneroom/shared";
import { CREASES_KEY } from "@/components/viewport/shapeGeometry";

/** The points and triangles of a three.js geometry, as the edit functions take them (nothing is copied but the index). */
export function editMeshOf(geometry: BufferGeometry): EditMesh | null {
  const position = geometry.getAttribute("position") as
    BufferAttribute | undefined;
  if (!position) return null;
  const index = geometry.index;
  return {
    positions: position.array as Float32Array,
    indices: index
      ? Uint32Array.from(index.array)
      : Uint32Array.from({ length: position.count }, (_, i) => i),
    creases: geometry.userData[CREASES_KEY] as readonly Crease[] | undefined,
  };
}

/** The topology of what the geometry shows right now (points that were moved are taken as they are). */
export function topologyOfGeometry(geometry: BufferGeometry): Topology | null {
  const mesh = editMeshOf(geometry);
  return mesh ? buildTopology(mesh) : null;
}
