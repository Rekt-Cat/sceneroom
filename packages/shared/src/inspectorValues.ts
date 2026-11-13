import type { Transform } from "./scene";

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
