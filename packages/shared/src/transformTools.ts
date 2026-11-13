/** The three gizmo modes, in the order of the toolbar. */
export const TRANSFORM_MODES = ["translate", "rotate", "scale"] as const;

export type TransformMode = (typeof TRANSFORM_MODES)[number];

/** Keyboard shortcuts, same letters as Unity: W move, E rotate, R scale. */
// A Map, not a plain object: an object would also answer to inherited names like "constructor".
const MODE_KEYS = new Map<string, TransformMode>([
  ["w", "translate"],
  ["e", "rotate"],
  ["r", "scale"],
]);

/** Returns the mode for a pressed key, or null if the key is not a mode shortcut. */
export function modeForKey(key: string): TransformMode | null {
  return MODE_KEYS.get(key.toLowerCase()) ?? null;
}
