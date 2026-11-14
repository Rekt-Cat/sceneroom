import { normalizeHexColor } from "./color";
import { MAX_EMISSIVE_INTENSITY, type Material, type Transform } from "./scene";

/** Which part of a transform a field edits. */
export type TransformGroup = "position" | "rotation" | "scale";
/** 0 = X, 1 = Y, 2 = Z. */
export type Axis = 0 | 1 | 2;

/** Largest size (positive or negative) a typed number may have. Stops absurd values like 1e300. */
export const MAX_ABS_VALUE = 100_000;

/** Position at the origin, no rotation, normal size. */
export const IDENTITY_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;
export const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Reads a number typed by the user. Accepts "1.5", "-2", ".5", "+3", "1,5" (comma as the decimal
 * mark) and a trailing degree sign. Returns null for anything else, such as "", "1.5.2" or "abc".
 */
export function parseNumberInput(text: string): number | null {
  let cleaned = text.trim().replace(/°$/, "").trim();
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    cleaned = cleaned.replace(",", ".");
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && Math.abs(value) <= MAX_ABS_VALUE
    ? value
    : null;
}

/** Fixed number of decimals, and never "-0.00". */
export function formatNumber(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return Number(text) === 0 ? (0).toFixed(decimals) : text;
}

/** The number shown in a field. Rotation is stored in radians but shown in degrees. */
export function displayValue(
  transform: Transform,
  group: TransformGroup,
  axis: Axis,
): number {
  const value = transform[group][axis];
  return group === "rotation" ? radiansToDegrees(value) : value;
}

/**
 * Applies text typed into a field to a transform. Returns the new transform, or null if the text
 * is not a valid number (or is a scale of 0, which would flatten the object and break the gizmo).
 * Rotation text is in degrees.
 */
export function editTransform(
  transform: Transform,
  group: TransformGroup,
  axis: Axis,
  text: string,
): Transform | null {
  const typed = parseNumberInput(text);
  if (typed === null) return null;
  if (group === "scale" && typed === 0) return null;

  const stored = group === "rotation" ? degreesToRadians(typed) : typed;
  const next: [number, number, number] = [...transform[group]];
  next[axis] = stored;
  return { ...transform, [group]: next };
}

/** Reads a number between 0 and 1 typed by the user (for roughness and metalness). Null if it is not one. */
export function parseUnitInput(text: string): number | null {
  const value = parseNumberInput(text);
  return value !== null && value >= 0 && value <= 1 ? value : null;
}

/** A change to some surface values of an object (see `Material`). */
export type MaterialChange = Partial<Material>;

const UNIT_KEYS = ["roughness", "metalness", "opacity"] as const;
const FLAG_KEYS = [
  "doubleSided",
  "flatShading",
  "castShadow",
  "receiveShadow",
] as const;

/**
 * Cleans up a material change: numbers that are not finite are dropped, the rest are kept inside
 * their range (0 to 1, and 0 to the strongest glow for the glow strength); a glow colour must be a
 * valid hex code (any case, "#RGB" too) and is stored as "#rrggbb"; the switches must be true or
 * false. Anything else is dropped. Returns an empty object if nothing usable is left.
 */
export function sanitizeMaterialChange(change: MaterialChange): MaterialChange {
  const clean: MaterialChange = {};
  for (const key of UNIT_KEYS) {
    const value = change[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = Math.min(1, Math.max(0, value));
    }
  }
  const glow = change.emissiveIntensity;
  if (typeof glow === "number" && Number.isFinite(glow)) {
    clean.emissiveIntensity = Math.min(
      MAX_EMISSIVE_INTENSITY,
      Math.max(0, glow),
    );
  }
  if (typeof change.emissiveColor === "string") {
    const color = normalizeHexColor(change.emissiveColor);
    if (color !== null) clean.emissiveColor = color;
  }
  for (const key of FLAG_KEYS) {
    if (typeof change[key] === "boolean") clean[key] = change[key];
  }
  return clean;
}

/** True if applying the (cleaned) change would alter at least one value of the material. */
export function materialChangeDiffers(
  material: Material,
  change: MaterialChange,
): boolean {
  return (Object.keys(change) as (keyof Material)[]).some(
    (key) => change[key] !== undefined && change[key] !== material[key],
  );
}

/**
 * The transform with one part (position, rotation or scale) put back to its starting value and the
 * other parts left as they are. Used by the reset button of each row in the Inspector.
 */
export function resetTransformGroup(
  transform: Transform,
  group: TransformGroup,
): Transform {
  return { ...transform, [group]: [...IDENTITY_TRANSFORM[group]] };
}

/**
 * Like `editTransform` for a scale value, but with the three scale values linked: changing one by a
 * factor changes the other two by the same factor, so the shape keeps its proportions (double X and
 * Y and Z double too). The edited axis gets exactly the number typed. Returns null if the text is not
 * a valid scale, or if the result would be too large for any of the three.
 */
export function editScaleProportionally(
  transform: Transform,
  axis: Axis,
  text: string,
): Transform | null {
  const typed = parseNumberInput(text);
  if (typed === null || typed === 0) return null;
  const current = transform.scale[axis];
  // A scale that is 0 has no proportions to keep: edit just this one
  if (current === 0) return editTransform(transform, "scale", axis, text);

  const factor = typed / current;
  const scale = transform.scale.map((value) => value * factor) as [
    number,
    number,
    number,
  ];
  scale[axis] = typed;
  if (scale.some((value) => Math.abs(value) > MAX_ABS_VALUE)) return null;
  return { ...transform, scale };
}
