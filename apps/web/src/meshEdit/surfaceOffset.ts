import type { Material, Mesh } from "three";

/**
 * Pushes the surface of a mesh back a little in the depth buffer, so lines and points lying exactly on it are
 * drawn in front of it instead of fighting with it, while still being hidden by faces that really are in
 * front. Returns a function that puts the material back as it was.
 */
export function pushSurfaceBack(mesh: Mesh): () => void {
  const materials: Material[] = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  const saved = materials.map((material) => ({
    material,
    on: material.polygonOffset,
    factor: material.polygonOffsetFactor,
    units: material.polygonOffsetUnits,
  }));
  for (const material of materials) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
  }
  return () => {
    for (const { material, on, factor, units } of saved) {
      material.polygonOffset = on;
      material.polygonOffsetFactor = factor;
      material.polygonOffsetUnits = units;
    }
  };
}
