import type { Vec3 } from "./index";
import { normalizeHexColor } from "./color";
import type { EnvironmentSettings, Scene } from "./scene";

/** A change to some environment settings. */
export type EnvironmentChange = Partial<EnvironmentSettings>;

const COLOR_KEYS = [
  "backgroundColor",
  "skyTop",
  "skyHorizon",
  "skyGround",
  "fogColor",
] as const;

/** Range of each number setting: [smallest, largest]. */
const NUMBER_RANGES = {
  reflectionStrength: [0, 5],
  fogNear: [0, 1000],
  fogFar: [1, 2000],
  ambientIntensity: [0, 5],
  sunIntensity: [0, 10],
  sunAzimuth: [0, 360],
  sunElevation: [0, 90],
} as const;

const FLAG_KEYS = ["fogEnabled", "sunEnabled"] as const;

/**
 * Cleans up an environment change: numbers that are not finite are dropped, the rest are kept inside
 * their range; colours must be valid hex codes (stored as "#rrggbb"); switches must be true or false;
 * the two choices must be one of their allowed values. Anything else is dropped.
 */
export function sanitizeEnvironmentChange(
  change: EnvironmentChange,
): EnvironmentChange {
  const clean: Record<string, unknown> = {};
  for (const key of COLOR_KEYS) {
    const value = change[key];
    if (typeof value !== "string") continue;
    const color = normalizeHexColor(value);
    if (color !== null) clean[key] = color;
  }
  for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
    const value = change[key as keyof typeof NUMBER_RANGES];
    if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = Math.min(max, Math.max(min, value));
    }
  }
  for (const key of FLAG_KEYS) {
    if (typeof change[key] === "boolean") clean[key] = change[key];
  }
  if (change.backgroundMode === "color" || change.backgroundMode === "sky") {
    clean["backgroundMode"] = change.backgroundMode;
  }
  if (
    change.reflections === "off" ||
    change.reflections === "studio" ||
    change.reflections === "sky"
  ) {
    clean["reflections"] = change.reflections;
  }
  return clean as EnvironmentChange;
}

/** True if applying the (cleaned) change would alter at least one setting. */
export function environmentChangeDiffers(
  environment: EnvironmentSettings,
  change: EnvironmentChange,
): boolean {
  return (Object.keys(change) as (keyof EnvironmentSettings)[]).some(
    (key) => change[key] !== undefined && change[key] !== environment[key],
  );
}

/** Changes some environment settings, keeping the others. */
export function setEnvironment(scene: Scene, change: EnvironmentChange): Scene {
  return { ...scene, environment: { ...scene.environment, ...change } };
}

/** How far from the middle of the scene the built-in sun is placed (only its direction matters for the light). */
export const SUN_DISTANCE = 12;

/** Where the built-in sun stands, from its compass direction and height (degrees). */
export function sunPosition(
  azimuthDegrees: number,
  elevationDegrees: number,
): Vec3 {
  const azimuth = (azimuthDegrees * Math.PI) / 180;
  const elevation = (elevationDegrees * Math.PI) / 180;
  const flat = Math.cos(elevation) * SUN_DISTANCE;
  return [
    flat * Math.sin(azimuth),
    Math.sin(elevation) * SUN_DISTANCE,
    flat * Math.cos(azimuth),
  ];
}
