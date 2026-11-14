"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import {
  DoubleSide,
  Object3D,
  Vector3,
  type DirectionalLight,
  type Light,
  type LightShadow,
} from "three";
import type { LightKind, LightSettings } from "@sceneroom/shared";
import { OUTLINE_COLOR, OUTLINE_THICKNESS } from "./selectionStyle";
import { useShadowCamera } from "./useShadowCamera";

/** Size of the little ball that marks where a light is, in units. */
const MARKER_RADIUS = 0.18;

/** How long the arrow of a directional light, and the cone drawn for a spot light, are. */
const GUIDE_LENGTH = 1.2;

/**
 * How the shadows of each kind of light are drawn.
 * - mapSize: sharpness, in pixels per side of the shadow picture (a point light needs six of them, so it gets fewer)
 * - bias: pushes the shadow slightly away from the surface, so a surface does not shadow itself in stripes
 * - normalBias: the same push along the surface's own direction; cures stripes on curved shapes
 * - radius: how soft the edge of the shadow is
 */
const SHADOW_QUALITY: Record<
  LightKind,
  { mapSize: number; bias: number; normalBias: number; radius: number }
> = {
  directional: { mapSize: 2048, bias: -0.0003, normalBias: 0.04, radius: 3 },
  spot: { mapSize: 2048, bias: -0.0005, normalBias: 0.03, radius: 3 },
  point: { mapSize: 1024, bias: -0.001, normalBias: 0.05, radius: 2 },
};

/** How close, and how far (when the light has no range), a point or spot light draws shadows. */
const SHADOW_NEAR = 0.3;
const SHADOW_FAR_UNLIMITED = 80;

/**
 * A directional light shadows objects within this many units of the middle of the scene, whatever
 * way it turns and wherever its marker stands (sunlight only has a direction, not a position).
 */
const SUN_SHADOW_AREA = 15;

/** How far from the middle of the scene a directional light's shadow picture is taken from. */
const SUN_DISTANCE = 30;

const _direction = new Vector3();
const _spot = new Vector3();

/**
 * The inside of a light object: the light itself, and a small marker in the light's colour so there is
 * something to see, click and move. A light shines along its own -Z direction (the front), which is why
 * it is aimed by rotating the object. Nothing draws a shadow of the marker.
 *
 * - directional: a ball with an arrow showing the direction (it shines the same everywhere; only the
 *   direction matters, not the position)
 * - point: a ball (shines in all directions)
 * - spot: a ball with a cone showing how wide the beam is
 */
export default function LightObject({
  kind,
  light,
  selected,
}: {
  kind: LightKind;
  light: LightSettings;
  selected: boolean;
}) {
  // Directional and spot lights look at a "target". A spot light's is one unit in front of it, which
  // moves and turns with it; a directional light's is the middle of the scene (set every frame, below).
  const target = useMemo(() => new Object3D(), []);
  const lightRef = useRef<(Light & { shadow: LightShadow }) | null>(null);
  const quality = SHADOW_QUALITY[kind];
  const shadowProps = {
    castShadow: light.castShadow,
    "shadow-mapSize": [quality.mapSize, quality.mapSize] as [number, number],
    "shadow-bias": quality.bias,
    "shadow-normalBias": quality.normalBias,
    "shadow-radius": quality.radius,
  };
  const shadowFar = light.range > 0 ? light.range : SHADOW_FAR_UNLIMITED;

  // A directional light only has a direction. Its shadow picture is taken from a spot behind the middle
  // of the scene, looking along the direction of the light, so the shadows stay right wherever the
  // marker is moved to (the picture would otherwise be taken from the marker and miss the scene).
  useShadowCamera(
    lightRef,
    kind === "directional"
      ? {
          near: 1,
          far: SUN_DISTANCE * 2,
          left: -SUN_SHADOW_AREA,
          right: SUN_SHADOW_AREA,
          top: SUN_SHADOW_AREA,
          bottom: -SUN_SHADOW_AREA,
        }
      : { near: SHADOW_NEAR, far: shadowFar },
  );

  useFrame(() => {
    const sun = lightRef.current as DirectionalLight | null;
    const parent = sun?.parent;
    if (kind !== "directional" || !sun || !parent) return;
    parent.updateWorldMatrix(true, false);
    _direction.set(0, 0, -1).transformDirection(parent.matrixWorld);
    _spot.copy(_direction).multiplyScalar(-SUN_DISTANCE);
    sun.position.copy(parent.worldToLocal(_spot));
    target.position.copy(parent.worldToLocal(_direction.set(0, 0, 0)));
  });

  return (
    <>
      <primitive
        object={target}
        position={kind === "directional" ? undefined : [0, 0, -1]}
      />
      {kind === "directional" && (
        <directionalLight
          ref={lightRef}
          color={light.color}
          intensity={light.intensity}
          target={target}
          {...shadowProps}
        />
      )}
      {kind === "point" && (
        <pointLight
          ref={lightRef}
          color={light.color}
          intensity={light.intensity}
          distance={light.range}
          decay={2}
          {...shadowProps}
        />
      )}
      {kind === "spot" && (
        <spotLight
          ref={lightRef}
          color={light.color}
          intensity={light.intensity}
          distance={light.range}
          angle={(light.angle * Math.PI) / 180}
          penumbra={light.penumbra}
          decay={2}
          target={target}
          {...shadowProps}
        />
      )}

      <mesh>
        <sphereGeometry args={[MARKER_RADIUS, 16, 12]} />
        <meshBasicMaterial color={light.color} />
        {selected && (
          <Outlines color={OUTLINE_COLOR} thickness={OUTLINE_THICKNESS} />
        )}
      </mesh>

      {kind === "directional" && (
        // An arrow along the front: a thin rod and a small cone for the head
        <group rotation-x={-Math.PI / 2}>
          <mesh position={[0, GUIDE_LENGTH / 2, 0]}>
            <cylinderGeometry args={[0.025, 0.025, GUIDE_LENGTH, 8]} />
            <meshBasicMaterial color={light.color} />
          </mesh>
          <mesh position={[0, GUIDE_LENGTH, 0]}>
            <coneGeometry args={[0.09, 0.22, 12]} />
            <meshBasicMaterial color={light.color} />
          </mesh>
        </group>
      )}

      {kind === "spot" && (
        // The cone of the beam as a see-through shell: its tip is at the light, its width follows the angle
        <mesh position={[0, 0, -GUIDE_LENGTH / 2]} rotation-x={Math.PI / 2}>
          <coneGeometry
            args={[
              Math.tan((light.angle * Math.PI) / 180) * GUIDE_LENGTH,
              GUIDE_LENGTH,
              24,
              1,
              true,
            ]}
          />
          <meshBasicMaterial
            color={light.color}
            wireframe
            transparent
            opacity={0.5}
            side={DoubleSide}
          />
        </mesh>
      )}
    </>
  );
}
