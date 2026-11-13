import { describe, expect, it } from "vitest";
import { boundsOfPoints, rectFromPoints, rectsOverlap } from "./screenRect";

describe("rectFromPoints", () => {
  it("gives the same rectangle whichever corner the drag started from", () => {
    const expected = { left: 10, top: 20, right: 50, bottom: 80 };
    expect(rectFromPoints(10, 20, 50, 80)).toEqual(expected);
    expect(rectFromPoints(50, 80, 10, 20)).toEqual(expected);
    expect(rectFromPoints(50, 20, 10, 80)).toEqual(expected);
  });
});

describe("boundsOfPoints", () => {
  it("wraps all points", () => {
    expect(
      boundsOfPoints([
        { x: 5, y: 9 },
        { x: -2, y: 4 },
        { x: 7, y: 1 },
      ]),
    ).toEqual({ left: -2, top: 1, right: 7, bottom: 9 });
  });

  it("returns null for no points", () => {
    expect(boundsOfPoints([])).toBeNull();
  });
});

describe("rectsOverlap", () => {
  const box = { left: 0, top: 0, right: 10, bottom: 10 };

  it("is true for overlapping, contained and touching rectangles", () => {
    expect(rectsOverlap(box, { left: 5, top: 5, right: 20, bottom: 20 })).toBe(
      true,
    );
    expect(rectsOverlap(box, { left: 2, top: 2, right: 3, bottom: 3 })).toBe(
      true,
    );
    expect(rectsOverlap(box, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(
      true,
    );
  });

  it("is false for rectangles that are apart", () => {
    expect(rectsOverlap(box, { left: 11, top: 0, right: 20, bottom: 10 })).toBe(
      false,
    );
    expect(rectsOverlap(box, { left: 0, top: 11, right: 10, bottom: 20 })).toBe(
      false,
    );
  });
});
