import { describe, expect, it } from "vitest";
import {
  blankPaint,
  hexToRgb,
  isPngBytes,
  paintSegment,
  type Brush,
} from "./paint";

const SIZE = 64;
const RED: Brush = { color: [255, 0, 0], radius: 4, hardness: 1, opacity: 1 };
const pixel = (p: Uint8ClampedArray, x: number, y: number) =>
  Array.from(p.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4));

describe("hexToRgb", () => {
  it("reads six-digit colours and falls back to black", () => {
    expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
    expect(hexToRgb("red")).toEqual([0, 0, 0]);
  });
});

describe("isPngBytes", () => {
  it("knows the PNG signature", () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
    ]);
    expect(isPngBytes(png)).toBe(true);
    expect(isPngBytes(Uint8Array.from([1, 2, 3]))).toBe(false);
  });
});

describe("paintSegment", () => {
  it("makes a single dab where the stroke starts, v = 1 being the top row", () => {
    const p = blankPaint(SIZE, [255, 255, 255]);
    const dirty = paintSegment(p, SIZE, null, [0.5, 0.5], RED);
    expect(pixel(p, 32, 32)).toEqual([255, 0, 0, 255]);
    expect(pixel(p, 10, 10)).toEqual([255, 255, 255, 255]);
    expect(dirty).toEqual({ x0: 28, y0: 28, x1: 36, y1: 36 });
    const top = blankPaint(SIZE, [255, 255, 255]);
    paintSegment(top, SIZE, null, [0.5, 0.99], RED);
    expect(pixel(top, 32, 0)).toEqual([255, 0, 0, 255]);
  });

  it("joins two touches with a line", () => {
    const p = blankPaint(SIZE, [255, 255, 255]);
    paintSegment(p, SIZE, [0.25, 0.5], [0.5, 0.5], RED);
    expect(pixel(p, 24, 32)).toEqual([255, 0, 0, 255]);
  });

  it("does not draw across a jump to another part of the map", () => {
    const p = blankPaint(SIZE, [255, 255, 255]);
    paintSegment(p, SIZE, [0.05, 0.5], [0.9, 0.5], RED);
    expect(pixel(p, 32, 32)).toEqual([255, 255, 255, 255]);
    expect(pixel(p, 57, 32)).toEqual([255, 0, 0, 255]);
  });

  it("fades a soft brush towards its edge and respects opacity", () => {
    const soft = blankPaint(SIZE, [255, 255, 255]);
    paintSegment(soft, SIZE, null, [0.5, 0.5], {
      ...RED,
      radius: 10,
      hardness: 0,
    });
    const middle = pixel(soft, 32, 32)[1]!;
    const nearEdge = pixel(soft, 40, 32)[1]!;
    expect(middle).toBeLessThan(30);
    expect(nearEdge).toBeGreaterThan(middle);
    const faint = blankPaint(SIZE, [255, 255, 255]);
    paintSegment(faint, SIZE, null, [0.5, 0.5], { ...RED, opacity: 0.5 });
    expect(pixel(faint, 32, 32)[1]).toBeCloseTo(128, -1);
  });

  it("stays inside the picture at the border and reports nothing for a dab far outside", () => {
    const p = blankPaint(SIZE, [255, 255, 255]);
    expect(paintSegment(p, SIZE, null, [0, 1], RED)).toEqual({
      x0: 0,
      y0: 0,
      x1: 4,
      y1: 4,
    });
    expect(paintSegment(p, SIZE, null, [3, 3], RED)).toBeNull();
  });
});
