/**
 * Texture painting, as plain functions on a block of pixels (red, green, blue, alpha, one byte each, row by row, the top
 * row first). The browser draws the same block on screen; keeping the maths here makes it testable without a browser.
 */

/** Width and height of a painted picture, in pixels. */
export const PAINT_TEXTURE_SIZE = 1024;

/** The brush: colour (0 to 255 each), radius in pixels, hardness (0 soft edge to 1 hard edge) and strength (0 to 1). */
export type Brush = {
  color: readonly [number, number, number];
  /** Which of red, green and blue the brush changes (default all three). Painting roughness changes only green. */
  channels?: readonly [boolean, boolean, boolean];
  radius: number;
  hardness: number;
  opacity: number;
};

export const BRUSH_LIMITS = { minRadius: 1, maxRadius: 200 } as const;

export const DEFAULT_BRUSH = {
  color: "#d94f4f",
  radius: 24,
  hardness: 0.5,
  opacity: 1,
} as const;

/**
 * Stamps are placed this fraction of the radius apart along a stroke: closer is smoother, wider shows dots.
 */
const STAMP_SPACING = 0.25;

/**
 * Two touches further apart than this (as a share of the picture) are not joined by a line: the pointer jumped to
 * another piece of the map, and the stretch between is not on the surface.
 */
const MAX_JOIN = 0.25;

export type DirtyRect = { x0: number; y0: number; x1: number; y1: number };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** True if the bytes start like a PNG picture. */
export function isPngBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length > PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, i) => bytes[i] === value)
  );
}

/** "#d94f4f" as red, green and blue (0 to 255). Anything that is not a six-digit hex colour gives black. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return [0, 0, 0];
  const n = parseInt(match[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A picture of one flat colour (fully opaque). */
export function blankPaint(
  size: number,
  color: readonly [number, number, number],
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
    pixels[i + 3] = 255;
  }
  return pixels;
}

/**
 * The starting picture for roughness and metalness: green is the object's roughness and blue its metalness (0 to 1
 * as 0 to 255), so the object looks the same until something is painted. Red is unused.
 */
export function surfacePaint(
  size: number,
  roughness: number,
  metalness: number,
): Uint8ClampedArray {
  return blankPaint(size, surfaceValues(roughness, metalness));
}

/** The red, green and blue of an untouched roughness and metalness picture. */
export function surfaceValues(
  roughness: number,
  metalness: number,
): [number, number, number] {
  return [255, Math.round(roughness * 255), Math.round(metalness * 255)];
}

/** Sets the chosen channels of every pixel to the colour's values (the other channels stay). */
export function fillChannels(
  pixels: Uint8ClampedArray,
  color: readonly [number, number, number],
  channels: readonly [boolean, boolean, boolean] = [true, true, true],
): void {
  for (let i = 0; i < pixels.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      if (channels[k]) pixels[i + k] = color[k]!;
    }
  }
}

/** How much of the brush colour a pixel at `distance` (0 to 1 of the radius) gets: 1 inside the hard core, fading to 0 at the edge. */
function falloff(distance: number, hardness: number): number {
  if (distance >= 1) return 0;
  if (distance <= hardness) return 1;
  return (1 - distance) / (1 - hardness);
}

/** One round dab of the brush centred on (cx, cy) pixels. Returns the pixels it touched, or null if it was off the picture. */
function stamp(
  pixels: Uint8ClampedArray,
  size: number,
  cx: number,
  cy: number,
  brush: Brush,
): DirtyRect | null {
  const r = brush.radius;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(size - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(size - 1, Math.ceil(cy + r));
  if (x0 > x1 || y0 > y1) return null;
  const hardness = Math.min(0.999, Math.max(0, brush.hardness));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // The middle of the pixel, not its corner, so a stamp at a whole number is centred
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      const a = falloff(d, hardness) * brush.opacity;
      if (a <= 0) continue;
      const at = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) {
        if (brush.channels && !brush.channels[k]) continue;
        pixels[at + k] = pixels[at + k]! * (1 - a) + brush.color[k]! * a;
      }
      pixels[at + 3] = 255;
    }
  }
  return { x0, y0, x1, y1 };
}

function join(a: DirtyRect | null, b: DirtyRect | null): DirtyRect | null {
  if (!a) return b;
  if (!b) return a;
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

/**
 * Paints from one touch of the surface to the next. `from` and `to` are map coordinates (u across, v up: v = 1 is the
 * top row of the picture). `from` is null for the first touch of a stroke (one dab). Overlapping dabs add up, like an
 * airbrush: going over a spot again makes it stronger. Returns the area of the picture that changed (to redraw only
 * that), or null if nothing did.
 */
export function paintSegment(
  pixels: Uint8ClampedArray,
  size: number,
  from: readonly [number, number] | null,
  to: readonly [number, number],
  brush: Brush,
): DirtyRect | null {
  const toX = to[0] * size;
  const toY = (1 - to[1]) * size;
  if (!from || Math.hypot(to[0] - from[0], to[1] - from[1]) > MAX_JOIN) {
    return stamp(pixels, size, toX, toY, brush);
  }
  const fromX = from[0] * size;
  const fromY = (1 - from[1]) * size;
  const length = Math.hypot(toX - fromX, toY - fromY);
  const step = Math.max(1, brush.radius * STAMP_SPACING);
  const count = Math.max(1, Math.ceil(length / step));
  let dirty: DirtyRect | null = null;
  // Starts at the first step: the dab at `from` was made by the previous segment
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    dirty = join(
      dirty,
      stamp(
        pixels,
        size,
        fromX + (toX - fromX) * t,
        fromY + (toY - fromY) * t,
        brush,
      ),
    );
  }
  return dirty;
}
