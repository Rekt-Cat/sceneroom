import { z } from "zod";

/** Smallest, largest and starting width (in pixels) of a side panel. */
export type PanelLimits = { min: number; max: number; default: number };

export const LEFT_PANEL_LIMITS: PanelLimits = {
  min: 220,
  max: 480,
  default: 288,
};
export const RIGHT_PANEL_LIMITS: PanelLimits = {
  min: 260,
  max: 520,
  default: 304,
};

/** The 3D view never gets narrower than this when a panel is dragged wider. */
export const MIN_VIEWPORT_WIDTH = 360;

/**
 * How wide a panel may become right now: its own maximum, but leaving the 3D view at least
 * MIN_VIEWPORT_WIDTH next to the other panel. Never below the panel's minimum.
 */
export function maxPanelWidth(
  limits: PanelLimits,
  otherPanelWidth: number,
  windowWidth: number,
): number {
  const room = windowWidth - otherPanelWidth - MIN_VIEWPORT_WIDTH;
  return Math.max(limits.min, Math.min(limits.max, room));
}

/** Rounds a width and keeps it between the minimum and `maxAllowed`. Not a number: the default. */
export function clampPanelWidth(
  width: number,
  limits: PanelLimits,
  maxAllowed: number = limits.max,
): number {
  if (!Number.isFinite(width)) return limits.default;
  return Math.min(Math.max(Math.round(width), limits.min), maxAllowed);
}

const savedLayoutSchema = z.object({
  leftWidth: z.number().finite(),
  rightWidth: z.number().finite(),
});

export type SavedLayout = z.infer<typeof savedLayoutSchema>;

/** Reads panel widths saved as text (from browser storage). Returns null if the text is not valid. */
export function parseSavedLayout(text: string | null): SavedLayout | null {
  if (text === null) return null;
  try {
    const result = savedLayoutSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    // Not JSON at all (hand-edited or damaged storage): treat as "nothing saved"
    return null;
  }
}
