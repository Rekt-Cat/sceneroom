import type { BufferGeometry } from "three";
import { generatePlant, type PlantSettings } from "@sceneroom/shared";
import { buildMeshGeometry } from "./shapeGeometry";

/** The geometry of a plant: the wood, and the leaves (null when there are none). The caller must `dispose()` both. */
export type PlantGeometries = {
  bark: BufferGeometry;
  leaves: BufferGeometry | null;
};

/** Grows a plant from its settings and builds the geometry to draw it. */
export function buildPlantGeometries(settings: PlantSettings): PlantGeometries {
  const { bark, leaves } = generatePlant(settings);
  return {
    bark: buildMeshGeometry(bark, []),
    leaves: leaves.positions.length > 0 ? buildMeshGeometry(leaves, []) : null,
  };
}
