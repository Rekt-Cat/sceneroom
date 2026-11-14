import { describe, expect, it } from "vitest";
import { groundHit, thumbnailFraming } from "./placement";

describe("groundHit", () => {
  it("finds where a downward ray meets the floor", () => {
    // from 4 up, going down and forward at 45 degrees: lands 4 ahead
    expect(groundHit([0, 4, 0], [0, -1, -1])).toEqual([0, 0, -4]);
    expect(groundHit([1, 2, 3], [0, -1, 0])).toEqual([1, 0, 3]);
  });

  it("returns null for a ray that points up, is level, or starts under the floor", () => {
    expect(groundHit([0, 4, 0], [0, 1, 0])).toBeNull();
    expect(groundHit([0, 4, 0], [1, 0, 0])).toBeNull();
    expect(groundHit([0, -1, 0], [0, -1, 0])).toBeNull();
  });

  it("returns null when the hit is too far away", () => {
    expect(groundHit([0, 1, 0], [1, -0.001, 0])).toBeNull();
    expect(groundHit([0, 1, 0], [1, -0.001, 0], 5000)).not.toBeNull();
  });
});

describe("thumbnailFraming", () => {
  it("looks at the middle of the box, from further away for a bigger box", () => {
    const small = thumbnailFraming([0, 0, 0], [1, 1, 1]);
    const big = thumbnailFraming([0, 0, 0], [10, 10, 10]);
    expect(small.target).toEqual([0.5, 0.5, 0.5]);
    expect(big.distance).toBeCloseTo(small.distance * 10);
  });

  it("copes with a flat or empty box", () => {
    expect(thumbnailFraming([0, 0, 0], [0, 0, 0]).distance).toBeGreaterThan(0);
  });
});
