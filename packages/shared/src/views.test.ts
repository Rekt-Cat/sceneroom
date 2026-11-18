import { describe, expect, it } from "vitest";
import {
  DEFAULT_PEEK_TILES,
  PEEK_SHOW_DELAY_MS,
  SIDE_VIEWS,
  VIEW_KINDS,
  VIEW_LABELS,
  isSideView,
  parsePeekTiles,
  peekOutcome,
  peekTileRects,
  sideFrame,
  tileAtPoint,
  zoomForFrame,
  type SideView,
} from "./views";

const unit = {
  min: [-1, -1, -1] as [number, number, number],
  max: [1, 1, 1] as [number, number, number],
};

describe("the views", () => {
  it("lists perspective and the six sides, each with a name", () => {
    expect(VIEW_KINDS).toHaveLength(7);
    for (const kind of VIEW_KINDS) expect(VIEW_LABELS[kind]).toBeTruthy();
    expect(isSideView("perspective")).toBe(false);
    expect(isSideView("top")).toBe(true);
  });

  it("starts with top, front, right and the perspective view", () => {
    expect(DEFAULT_PEEK_TILES).toEqual([
      "top",
      "front",
      "right",
      "perspective",
    ]);
  });

  it("every side looks along a plain axis, up is across it, and opposite sides look from opposite ends", () => {
    for (const view of Object.keys(SIDE_VIEWS) as SideView[]) {
      const { direction, up } = SIDE_VIEWS[view];
      expect(Math.hypot(...direction)).toBe(1);
      expect(Math.hypot(...up)).toBe(1);
      expect(
        direction[0] * up[0] + direction[1] * up[1] + direction[2] * up[2],
      ).toBe(0);
    }
    const sum = (a: SideView, b: SideView) =>
      SIDE_VIEWS[a].direction.map((v, i) => v + SIDE_VIEWS[b].direction[i]!);
    expect(sum("front", "back")).toEqual([0, 0, 0]);
    expect(sum("left", "right")).toEqual([0, 0, 0]);
    expect(sum("top", "bottom")).toEqual([0, 0, 0]);
  });
});

describe("the four tiles", () => {
  const rects = peekTileRects(1000, 600, 10);

  it("fill the view in a 2 by 2 grid, with the gap round the edge and between", () => {
    expect(rects).toHaveLength(4);
    expect(rects[0]).toEqual({ x: 10, y: 10, width: 485, height: 285 });
    expect(rects[1]!.x).toBe(10 * 2 + 485);
    expect(rects[2]!.y).toBe(10 * 2 + 285);
    // the right edge of the right tiles is the width minus the gap
    expect(rects[1]!.x + rects[1]!.width).toBe(1000 - 10);
    expect(rects[3]!.y + rects[3]!.height).toBe(600 - 10);
  });

  it("are never negative, even in a view that is too small", () => {
    for (const r of peekTileRects(10, 10, 8)) {
      expect(r.width).toBeGreaterThanOrEqual(0);
      expect(r.height).toBeGreaterThanOrEqual(0);
    }
  });

  it("say which tile a spot is in, the gaps going to the nearest tile", () => {
    expect(tileAtPoint(rects, 100, 100)).toBe(0);
    expect(tileAtPoint(rects, 800, 100)).toBe(1);
    expect(tileAtPoint(rects, 100, 500)).toBe(2);
    expect(tileAtPoint(rects, 800, 500)).toBe(3);
    // in the middle gaps and at the very edges
    expect(tileAtPoint(rects, 499, 299)).toBe(0);
    expect(tileAtPoint(rects, 501, 301)).toBe(3);
    expect(tileAtPoint(rects, 0, 0)).toBe(0);
    expect(tileAtPoint(rects, 5000, 5000)).toBe(3);
    expect(tileAtPoint([], 1, 1)).toBe(-1);
  });
});

describe("framing a box in a flat view", () => {
  it("looks at the middle of the box from the side the view is on, with the right way up", () => {
    const frame = sideFrame({ min: [0, 0, 0], max: [2, 4, 6] }, "front", 1.5);
    expect(frame.target).toEqual([1, 2, 3]);
    expect(frame.position[0]).toBe(1);
    expect(frame.position[1]).toBe(2);
    expect(frame.position[2]).toBeGreaterThan(3 + 3); // in front of the box (+z), outside it
    expect(frame.up).toEqual([0, 1, 0]);
    expect(frame.near).toBeGreaterThan(0);
    expect(frame.far).toBeGreaterThan(frame.position[2] - 0);
  });

  it("shows what is across (x) and up (y) for the front, what is across (z) and up (y) for the right", () => {
    const box = {
      min: [-1, -2, -3] as [number, number, number],
      max: [1, 2, 3] as [number, number, number],
    };
    // a very wide view: the height decides (y is 2 each way)
    const front = sideFrame(box, "front", 4, 1);
    expect(front.halfHeight).toBeCloseTo(2, 9);
    expect(front.halfWidth).toBeCloseTo(8, 9);
    // from the right the width across is z (3 each way) and up is y (2): in a square view, 3 decides
    const right = sideFrame(box, "right", 1, 1);
    expect(right.halfHeight).toBeCloseTo(3, 9);
    expect(right.halfWidth).toBeCloseTo(3, 9);
    // from the top: across is x (1) and up on the screen is -z (3)
    const top = sideFrame(box, "top", 1, 1);
    expect(top.halfHeight).toBeCloseTo(3, 9);
  });

  it("the shape of the view only changes how it fits, never cuts the object off", () => {
    const box = {
      min: [-1, -2, -3] as [number, number, number],
      max: [1, 2, 3] as [number, number, number],
    };
    for (const aspect of [0.4, 1, 2.5]) {
      const f = sideFrame(box, "front", aspect, 1);
      expect(f.halfWidth).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(f.halfHeight).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(f.halfWidth / f.halfHeight).toBeCloseTo(aspect, 9);
    }
  });

  it("opposite sides frame the same size and stand on opposite sides", () => {
    const box = {
      min: [0, 0, 0] as [number, number, number],
      max: [4, 2, 2] as [number, number, number],
    };
    const a = sideFrame(box, "left", 1.3);
    const b = sideFrame(box, "right", 1.3);
    expect(a.halfHeight).toBeCloseTo(b.halfHeight, 9);
    expect(a.position[0]! + b.position[0]!).toBeCloseTo(2 * 2, 9);
  });

  it("a tiny box or a single point still gives a sensible, non-zero view", () => {
    const point = sideFrame({ min: [1, 1, 1], max: [1, 1, 1] }, "top", 1.6);
    expect(point.halfHeight).toBeGreaterThan(0);
    expect(Number.isFinite(point.far)).toBe(true);
    expect(sideFrame(unit, "front", 0).halfWidth).toBeGreaterThan(0);
  });

  it("the camera is outside the box, with the whole box between near and far", () => {
    for (const view of Object.keys(SIDE_VIEWS) as SideView[]) {
      const f = sideFrame(unit, view, 1.6);
      const along = f.position.map((p, i) => p - f.target[i]!);
      const distance = Math.hypot(...along);
      expect(distance).toBeGreaterThan(Math.hypot(1, 1, 1));
      // the unit box reaches 1 towards and away from the camera in every side view
      expect(f.near).toBeLessThan(distance - 1);
      expect(f.far).toBeGreaterThan(distance + 1);
    }
  });

  it("the near plane stands just in front of the object, so what is between it and the camera is cut away", () => {
    const f = sideFrame({ min: [-1, -1, -1], max: [1, 1, 1] }, "front", 1.6);
    const distance = f.position[2] - f.target[2];
    // the front face of the box is 1 in front of its middle; the near plane is a little in front of that
    expect(f.near).toBeGreaterThan(distance - 1 - 0.1);
    expect(f.near).toBeLessThan(distance - 1);
    // a thick box lets the near plane go further back (it starts at the box's own front)
    const thick = sideFrame(
      { min: [-1, -1, -5], max: [1, 1, 5] },
      "front",
      1.6,
    );
    const thickDistance = thick.position[2] - thick.target[2];
    expect(thick.near).toBeGreaterThan(thickDistance - 5 - 0.5);
    expect(thick.near).toBeLessThan(thickDistance - 5);
  });

  it("the far plane stands just behind the object, so what is behind it is cut away too", () => {
    const f = sideFrame({ min: [-1, -1, -1], max: [1, 1, 1] }, "front", 1.6);
    const distance = f.position[2] - f.target[2];
    // the back face of the box is 1 behind its middle
    expect(f.far).toBeGreaterThan(distance + 1);
    expect(f.far).toBeLessThan(distance + 1 + 0.1);
    // only a slab as thick as the object (plus the little room) is left
    expect(f.far - f.near).toBeLessThan(2 + 0.2);
    expect(f.far - f.near).toBeGreaterThan(2);
    const thick = sideFrame(
      { min: [-1, -1, -5], max: [1, 1, 5] },
      "front",
      1.6,
    );
    expect(thick.far - thick.near).toBeGreaterThan(10);
    expect(thick.far - thick.near).toBeLessThan(10.5);
  });

  it("looking along another axis uses the depth of the box along THAT axis", () => {
    const box = {
      min: [-1, -1, -5] as [number, number, number],
      max: [1, 1, 5] as [number, number, number],
    };
    const front = sideFrame(box, "front", 1); // depth 5 along z
    const right = sideFrame(box, "right", 1); // depth 1 along x
    const frontGap = front.position[2] - front.near;
    const rightGap = right.position[0] - right.near;
    expect(frontGap).toBeGreaterThan(5);
    expect(rightGap).toBeGreaterThan(1);
    expect(rightGap).toBeLessThan(frontGap);
  });

  it("never lets the near plane reach the camera or go behind it", () => {
    for (const view of Object.keys(SIDE_VIEWS) as SideView[]) {
      const f = sideFrame({ min: [3, 3, 3], max: [3, 3, 3] }, view, 1);
      expect(f.near).toBeGreaterThanOrEqual(0.01);
      expect(f.near).toBeLessThan(f.far);
    }
  });

  it("the zoom that makes a frame fill a view is pixels per world unit", () => {
    const f = sideFrame(unit, "front", 1, 1);
    expect(zoomForFrame(f, 400)).toBeCloseTo(400 / 2, 9);
  });
});

describe("tap or hold", () => {
  it("a short press does nothing, a long one opens the tile it was released over", () => {
    expect(peekOutcome(PEEK_SHOW_DELAY_MS - 1, 2)).toBeNull();
    expect(peekOutcome(PEEK_SHOW_DELAY_MS, 2)).toBe(2);
    expect(peekOutcome(2000, 0)).toBe(0);
    expect(peekOutcome(2000, -1)).toBeNull();
    expect(peekOutcome(2000, 4)).toBeNull();
  });
});

describe("parsePeekTiles", () => {
  it("reads four known views, from text or from a list", () => {
    expect(parsePeekTiles('["top","front","left","perspective"]')).toEqual([
      "top",
      "front",
      "left",
      "perspective",
    ]);
    expect(parsePeekTiles(["back", "back", "bottom", "right"])).toEqual([
      "back",
      "back",
      "bottom",
      "right",
    ]);
  });
  it("gives null for anything else: wrong count, unknown view, damaged text, other types", () => {
    expect(parsePeekTiles('["top","front"]')).toBeNull();
    expect(parsePeekTiles(["top", "front", "right", "sideways"])).toBeNull();
    expect(parsePeekTiles("not json")).toBeNull();
    expect(parsePeekTiles(null)).toBeNull();
    expect(parsePeekTiles({ 0: "top" })).toBeNull();
  });
});
