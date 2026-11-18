import type { Vec3 } from "./index";

/**
 * The views of the four-view peek: hold Space with an object selected to see four views of it at once (three
 * pinned flat side views and the normal 3D view); let go and the view under the pointer opens big. This file
 * holds the maths (where the views stand, how they frame the object, which tile a spot is in), with no three.js
 * in it so it can be tested.
 */
export const VIEW_KINDS = [
  "perspective",
  "top",
  "front",
  "right",
  "left",
  "back",
  "bottom",
] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];
export type SideView = Exclude<ViewKind, "perspective">;

/** What each view is called in the drop-down. */
export const VIEW_LABELS: Record<ViewKind, string> = {
  perspective: "Perspective",
  top: "Top",
  front: "Front",
  right: "Right",
  left: "Left",
  back: "Back",
  bottom: "Bottom",
};

/**
 * Where a flat side view stands: `direction` is from the object towards the camera (so "front" looks at the
 * object from +z), and `up` is the way up on the screen. Top and bottom look along the y axis, so their up is
 * along z.
 */
export const SIDE_VIEWS: Record<SideView, { direction: Vec3; up: Vec3 }> = {
  top: { direction: [0, 1, 0], up: [0, 0, -1] },
  bottom: { direction: [0, -1, 0], up: [0, 0, 1] },
  front: { direction: [0, 0, 1], up: [0, 1, 0] },
  back: { direction: [0, 0, -1], up: [0, 1, 0] },
  right: { direction: [1, 0, 0], up: [0, 1, 0] },
  left: { direction: [-1, 0, 0], up: [0, 1, 0] },
};

/**
 * Reads what the four tiles were set to last time (saved text from the browser). Gives the four views, or null if
 * the text is not a list of exactly four known views (damaged, or from another version): the starting views are
 * used then.
 */
export function parsePeekTiles(raw: unknown): ViewKind[] | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value) || value.length !== 4) return null;
  const known = VIEW_KINDS as readonly unknown[];
  return value.every((view) => known.includes(view))
    ? (value as ViewKind[])
    : null;
}

/** True for a flat side view (not the perspective one). */
export function isSideView(view: ViewKind): view is SideView {
  return view !== "perspective";
}

/** The four views shown first, in the order top left, top right, bottom left, bottom right. */
export const DEFAULT_PEEK_TILES: readonly ViewKind[] = [
  "top",
  "front",
  "right",
  "perspective",
];

export type TileRect = { x: number; y: number; width: number; height: number };

/**
 * The four tiles that fill a view of `width` by `height` pixels, in the order top left, top right, bottom left,
 * bottom right, with `gap` pixels between them and round the edge.
 */
export function peekTileRects(
  width: number,
  height: number,
  gap = 8,
): TileRect[] {
  const w = Math.max(0, (width - gap * 3) / 2);
  const h = Math.max(0, (height - gap * 3) / 2);
  return [
    { x: gap, y: gap, width: w, height: h },
    { x: gap * 2 + w, y: gap, width: w, height: h },
    { x: gap, y: gap * 2 + h, width: w, height: h },
    { x: gap * 2 + w, y: gap * 2 + h, width: w, height: h },
  ];
}

/** The number of the tile a spot is in (the gaps belong to the nearest tile), or -1 if the tiles do not exist. */
export function tileAtPoint(
  rects: readonly TileRect[],
  x: number,
  y: number,
): number {
  if (rects.length === 0) return -1;
  // The tiles are a 2 by 2 grid: the middle of the grid splits them
  const midX = (rects[0]!.x + rects[0]!.width + rects[1]!.x) / 2;
  const midY = (rects[0]!.y + rects[0]!.height + rects[2]!.y) / 2;
  return (y >= midY ? 2 : 0) + (x >= midX ? 1 : 0);
}

export type Box3Like = { min: Vec3; max: Vec3 };

/** How a flat side view is set up to show a box: where the camera stands and what it sees. */
export type SideFrame = {
  target: Vec3;
  position: Vec3;
  up: Vec3;
  /** Half of what the view sees across and up, in world units (their ratio is the view's shape). */
  halfWidth: number;
  halfHeight: number;
  /** Where the view starts: everything nearer than this (between the camera and the object) is not drawn. */
  near: number;
  /** Where it ends: everything further than this (behind the object) is not drawn. */
  far: number;
};

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** How much room is left round the object in a framed view (1 = the object touches the edge). */
export const SIDE_VIEW_MARGIN = 1.25;
/** How much of the object's size is left in front of and behind it before things are cut away (so its own faces are not cut). */
export const SIDE_VIEW_NEAR_ROOM = 0.02;
/** The smallest size an object is framed as (a tiny object or a single point would fill the view). */
export const SIDE_VIEW_MIN_HALF_SIZE = 0.25;

/**
 * Frames a box in a flat side view: the camera stands on the line through the middle of the box in the view's
 * direction, far enough back to see all of it, and the view is just big enough to fit the box (with a margin)
 * at the shape of the view (`aspect` = width / height). A flat view has no perspective: only the size matters.
 */
export function sideFrame(
  box: Box3Like,
  view: SideView,
  aspect: number,
  margin = SIDE_VIEW_MARGIN,
): SideFrame {
  const { direction, up } = SIDE_VIEWS[view];
  const target: Vec3 = [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
  // The way the camera looks, and the screen's right and up
  const forward: Vec3 = [-direction[0], -direction[1], -direction[2]];
  const right = cross(forward, up);
  const screenUp = cross(right, forward);
  let across = 0;
  let high = 0;
  let depth = 0;
  let radius = 0;
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const offset: Vec3 = [x - target[0], y - target[1], z - target[2]];
        across = Math.max(across, Math.abs(dot(offset, right)));
        high = Math.max(high, Math.abs(dot(offset, screenUp)));
        depth = Math.max(depth, Math.abs(dot(offset, direction)));
        radius = Math.max(radius, Math.hypot(...offset));
      }
    }
  }
  const safeAspect = Math.max(aspect, 0.01);
  const halfHeight =
    Math.max(high, across / safeAspect, SIDE_VIEW_MIN_HALF_SIZE) * margin;
  const reach = Math.max(radius, SIDE_VIEW_MIN_HALF_SIZE);
  // Stand back by the size of the object plus a little, so nothing is behind the camera
  const distance = reach * 2 + 1;
  return {
    target,
    position: [
      target[0] + direction[0] * distance,
      target[1] + direction[1] * distance,
      target[2] + direction[2] * distance,
    ],
    up,
    halfWidth: halfHeight * safeAspect,
    halfHeight,
    // The near plane stands just in front of the object: whatever is between the camera and the object is
    // cut away instead of hiding it. (A little room is left so the object's own front is never cut.)
    near: Math.max(0.01, distance - depth - reach * SIDE_VIEW_NEAR_ROOM),
    // ... and the far plane just behind it, so what is behind the object is not drawn either
    far: distance + depth + reach * SIDE_VIEW_NEAR_ROOM,
  };
}

/** The zoom (pixels per world unit) that makes a frame fill a view of `pixelHeight` pixels. */
export function zoomForFrame(frame: SideFrame, pixelHeight: number): number {
  return pixelHeight / (2 * frame.halfHeight);
}

/** Holding Space for less than this long is a tap: it does nothing (and the four views do not even appear). */
export const PEEK_SHOW_DELAY_MS = 150;

/** What letting go of Space does: the number of the tile to open big, or null for a tap (or no tile under the pointer). */
export function peekOutcome(heldMs: number, tile: number): number | null {
  if (heldMs < PEEK_SHOW_DELAY_MS) return null;
  return tile >= 0 && tile <= 3 ? tile : null;
}
