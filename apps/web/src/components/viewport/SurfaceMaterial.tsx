"use client";

import { DoubleSide, FrontSide, type Texture } from "three";
import type { Material } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { getCheckerTexture } from "./checkerTexture";
import { useEnvironmentTexture } from "./environmentTexture";

/**
 * The surface of an object as three.js draws it, from the object's colour and its surface settings:
 * roughness, metalness, glow, opacity, flat shading, which sides are drawn, and how much of the scene's
 * reflections it shows. Used by shapes, meshes and plants, so they all look the same way.
 *
 * `cut` draws the object faded (an object waiting to be pasted). `checker` draws the UV checkerboard.
 */
export default function SurfaceMaterial({
  color,
  material,
  cut = false,
  checker = false,
  colorMap = null,
  surfaceMap = null,
  normalMap = null,
}: {
  color: string;
  material: Material;
  cut?: boolean;
  /** Draw the UV checkerboard instead of the colour (this object is selected and the checker is on). */
  checker?: boolean;
  /** The painted picture wrapped over the surface (through the UV map). It replaces the plain colour. */
  colorMap?: Texture | null;
  /** The painted roughness (green) and metalness (blue) of each spot. The two sliders are then multiplied by it, so they are 1 here. */
  surfaceMap?: Texture | null;
  /** A baked normal map: the detail of a dense mesh, as bumps on the surface. */
  normalMap?: Texture | null;
}) {
  const envTexture = useEnvironmentTexture((state) => state.texture);
  const reflectionStrength = useSceneStore(
    (state) => state.scene.environment.reflectionStrength,
  );
  const seeThrough = cut || material.opacity < 1;
  const checkerMap = checker ? getCheckerTexture() : null;
  // The checker wins while it is on; the painted picture replaces the colour otherwise
  const map = checkerMap ?? colorMap;
  return (
    <meshStandardMaterial
      // A new material when the shading, the side or solid / see-through changes: three.js builds its
      // shader for these (a solid material is compiled to ignore opacity completely)
      key={`${material.flatShading}-${material.doubleSided}-${seeThrough}-${envTexture !== null}-${map !== null}-${surfaceMap !== null}-${normalMap !== null}`}
      // What the surface reflects. Set on each material (and not left to the scene) so that the
      // object's own Reflection strength can scale it
      envMap={envTexture}
      envMapIntensity={material.reflectionStrength * reflectionStrength}
      // A picture is drawn in its own colours, not tinted by the object's
      color={map ? "#ffffff" : color}
      map={map}
      // A painted picture holds the values itself (the sliders would multiply them)
      normalMap={normalMap}
      roughnessMap={surfaceMap}
      metalnessMap={surfaceMap}
      roughness={surfaceMap ? 1 : material.roughness}
      metalness={surfaceMap ? 1 : material.metalness}
      emissive={material.emissiveColor}
      emissiveIntensity={material.emissiveIntensity}
      flatShading={material.flatShading}
      // A cut object is drawn faded until it is pasted; a see-through one does not hide what is behind it
      transparent={seeThrough}
      opacity={cut ? Math.min(0.4, material.opacity) : material.opacity}
      depthWrite={!seeThrough}
      // A plane has no thickness, so it needs both sides to be seen from behind
      side={material.doubleSided ? DoubleSide : FrontSide}
    />
  );
}
