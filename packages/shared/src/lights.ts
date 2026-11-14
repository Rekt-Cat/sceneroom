import type { Vec3 } from "./index";
import type { LightKind, LightSettings, Scene, SceneNode } from "./scene";
import { createNode } from "./sceneOps";

/** What a new light of each kind is like. */
export const DEFAULT_LIGHTS: Record<LightKind, LightSettings> = {
  directional: {
    color: "#ffffff",
    intensity: 1.5,
    range: 0,
    angle: 40,
    penumbra: 0.3,
    castShadow: true,
  },
  point: {
    color: "#ffffff",
    intensity: 40,
    range: 0,
    angle: 40,
    penumbra: 0.3,
    castShadow: false,
  },
  spot: {
    color: "#ffffff",
    intensity: 80,
    range: 0,
    angle: 40,
    penumbra: 0.3,
    castShadow: true,
  },
};

/**
 * The strongest setting of the Intensity slider. The numbers differ because the kinds are measured
 * differently: sunlight is a plain strength, while a bulb or torch fades with distance (the further
 * away, the dimmer), so it needs much bigger numbers to light something a few units away.
 */
export const MAX_LIGHT_INTENSITY: Record<LightKind, number> = {
  directional: 10,
  point: 300,
  spot: 600,
};

/** The name of a new light of each kind. */
const LIGHT_NAMES: Record<LightKind, string> = {
  directional: "Directional light",
  point: "Point light",
  spot: "Spot light",
};

/** Where a new light of each kind stands (a sun high above, a bulb and a torch a little above the ground). */
const LIGHT_POSITIONS: Record<LightKind, Vec3> = {
  directional: [4, 6, 3],
  point: [0, 3, 0],
  spot: [0, 4, 2],
};

/** True for objects that are lights. */
export function isLightNode(node: SceneNode): boolean {
  return node.light !== null;
}

/**
 * The rotation (x, y, z in radians, the order the scene stores them) that makes something point its
 * front (the direction of its local -Z, which is where lights shine) from one spot towards another.
 */
export function aimRotation(from: Vec3, to: Vec3): Vec3 {
  const forward = normalise([
    to[0] - from[0],
    to[1] - from[1],
    to[2] - from[2],
  ]);
  // The local Z axis points backwards; the X axis is sideways, found with "up" as a helper
  const back: Vec3 = [-forward[0], -forward[1], -forward[2]];
  let side = cross([0, 1, 0], back);
  // Looking straight up or down: any sideways direction will do
  if (Math.hypot(...side) < 1e-6) side = [1, 0, 0];
  side = normalise(side);
  const up = cross(back, side);
  // The turn as a matrix has `side`, `up`, `back` as its columns (m13 = back[0], and so on)
  const m11 = side[0];
  const m12 = up[0];
  const m13 = back[0];
  const m23 = back[1];
  const m33 = back[2];
  const m22 = up[1];
  const m32 = up[2];
  const y = Math.asin(Math.min(1, Math.max(-1, m13)));
  if (Math.abs(m13) < 0.9999999) {
    return [Math.atan2(-m23, m33) + 0, y, Math.atan2(-m12, m11) + 0];
  }
  return [Math.atan2(m32, m22) + 0, y, 0];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalise(v: Vec3): Vec3 {
  const length = Math.hypot(...v) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** A new light object, standing where `LIGHT_POSITIONS` says and aimed at the middle of the scene. */
export function createLightNode(id: string, kind: LightKind): SceneNode {
  const base = createNode(id, "cube");
  const position = LIGHT_POSITIONS[kind];
  return {
    ...base,
    name: LIGHT_NAMES[kind],
    kind,
    transform: {
      position: [...position],
      rotation: aimRotation(position, [0, 0, 0]),
      scale: [1, 1, 1],
    },
    light: { ...DEFAULT_LIGHTS[kind] },
  };
}

/** A change to some light settings. */
export type LightChange = Partial<LightSettings>;

/**
 * Cleans up a light change for a light of the given kind: numbers that are not finite are dropped,
 * the rest are kept inside their range (the intensity inside what the kind allows); a colour must be a
 * valid hex code and is stored as "#rrggbb"; the shadow switch must be true or false.
 */
export function sanitizeLightChange(
  kind: LightKind,
  change: LightChange,
): LightChange {
  const clean: LightChange = {};
  const number = (value: unknown, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : undefined;
  const intensity = number(change.intensity, 0, MAX_LIGHT_INTENSITY[kind]);
  if (intensity !== undefined) clean.intensity = intensity;
  const range = number(change.range, 0, 1000);
  if (range !== undefined) clean.range = range;
  const angle = number(change.angle, 1, 85);
  if (angle !== undefined) clean.angle = angle;
  const penumbra = number(change.penumbra, 0, 1);
  if (penumbra !== undefined) clean.penumbra = penumbra;
  if (typeof change.color === "string") {
    const match = /^#?([0-9a-f]{6})$/i.exec(change.color.trim());
    if (match) clean.color = `#${match[1]!.toLowerCase()}`;
  }
  if (typeof change.castShadow === "boolean")
    clean.castShadow = change.castShadow;
  return clean;
}

/** True if applying the (cleaned) change would alter at least one light setting. */
export function lightChangeDiffers(
  light: LightSettings,
  change: LightChange,
): boolean {
  return (Object.keys(change) as (keyof LightSettings)[]).some(
    (key) => change[key] !== undefined && change[key] !== light[key],
  );
}

/** Changes some settings of a light object, keeping the others. Throws for an object that is not a light. */
export function setLight(scene: Scene, id: string, change: LightChange): Scene {
  const node = scene.nodes[id];
  if (!node) throw new Error(`Node "${id}" does not exist`);
  if (!node.light) throw new Error(`Node "${id}" is not a light`);
  return {
    ...scene,
    nodes: {
      ...scene.nodes,
      [id]: { ...node, light: { ...node.light, ...change } },
    },
  };
}
