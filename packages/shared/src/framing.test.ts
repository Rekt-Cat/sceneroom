import { describe, expect, it } from "vitest";
import { framingDistance } from "./framing";

describe("framingDistance", () => {
  it("puts the camera far enough that a ball of that radius just fits (before padding)", () => {
    // 90 degrees: the view is as wide as it is far, so a ball of radius r needs r / sin(45 degrees)
    const distance = framingDistance(1, 90, 1, 1);
    expect(distance).toBeCloseTo(1 / Math.sin(Math.PI / 4), 6);
  });

  it("goes further for a bigger object and for more padding", () => {
    expect(framingDistance(4, 50, 1.6)).toBeGreaterThan(
      framingDistance(1, 50, 1.6),
    );
    expect(framingDistance(1, 50, 1.6, 2)).toBeGreaterThan(
      framingDistance(1, 50, 1.6, 1.2),
    );
  });

  it("goes further in a tall narrow view, where the width is what limits it", () => {
    expect(framingDistance(1, 50, 0.5)).toBeGreaterThan(
      framingDistance(1, 50, 2),
    );
    // a wide view is limited by its height, so making it wider changes nothing
    expect(framingDistance(1, 50, 2)).toBeCloseTo(framingDistance(1, 50, 3), 6);
  });

  it("does not move in close on a tiny object", () => {
    expect(framingDistance(0.001, 50, 1.6)).toBe(
      framingDistance(0.25, 50, 1.6),
    );
    expect(framingDistance(0, 50, 1.6)).toBeGreaterThan(0);
  });

  it("survives a view with no width", () => {
    expect(Number.isFinite(framingDistance(1, 50, 0))).toBe(true);
  });
});
