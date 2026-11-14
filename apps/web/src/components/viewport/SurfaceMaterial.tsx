"use client";

import { DoubleSide, FrontSide } from "three";
import type { Material } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { useEnvironmentTexture } from "./environmentTexture";

/**
 * The surface of an object as three.js draws it, from the object's colour and its surface settings:
 * roughness, metalness, glow, opacity, flat shading, which sides are drawn, and how much of the scene's
 * reflections it shows. Used by shapes, meshes and plants, so they all look the same way.
 *
 * `cut` draws the object faded (an object waiting to be pasted).
 */
export default function SurfaceMaterial({
  color,
  material,
  cut = false,
}: {
  color: string;
  material: Material;
  cut?: boolean;
}) {
  const envTexture = useEnvironmentTexture((state) => state.texture);
  const reflectionStrength = useSceneStore(
    (state) => state.scene.environment.reflectionStrength,
  );
  const seeThrough = cut || material.opacity < 1;
  return (
    <meshStandardMaterial
      // A new material when the shading, the side or solid / see-through changes: three.js builds its
      // shader for these (a solid material is compiled to ignore opacity completely)
      key={`${material.flatShading}-${material.doubleSided}-${seeThrough}-${envTexture !== null}`}
      // What the surface reflects. Set on each material (and not left to the scene) so that the
      // object's own Reflection strength can scale it
      envMap={envTexture}
      envMapIntensity={material.reflectionStrength * reflectionStrength}
      color={color}
      roughness={material.roughness}
      metalness={material.metalness}
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
