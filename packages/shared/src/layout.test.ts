import { describe, expect, it } from "vitest";
import {
  LEFT_PANEL_LIMITS,
  MIN_VIEWPORT_WIDTH,
  RIGHT_PANEL_LIMITS,
  clampPanelWidth,
  maxPanelWidth,
  parseSavedLayout,
} from "./layout";

describe("clampPanelWidth", () => {
  it("keeps a width within the limits and rounds it", () => {
    expect(clampPanelWidth(300.4, LEFT_PANEL_LIMITS)).toBe(300);
    expect(clampPanelWidth(10, LEFT_PANEL_LIMITS)).toBe(LEFT_PANEL_LIMITS.min);
    expect(clampPanelWidth(9999, LEFT_PANEL_LIMITS)).toBe(
      LEFT_PANEL_LIMITS.max,
    );
  });

  it("uses the default for anything that is not a number", () => {
    expect(clampPanelWidth(NaN, RIGHT_PANEL_LIMITS)).toBe(
      RIGHT_PANEL_LIMITS.default,
    );
    expect(clampPanelWidth(Infinity, RIGHT_PANEL_LIMITS)).toBe(
      RIGHT_PANEL_LIMITS.default,
    );
  });

  it("respects a smaller maximum, but never goes below the minimum", () => {
    expect(clampPanelWidth(400, LEFT_PANEL_LIMITS, 350)).toBe(350);
    expect(clampPanelWidth(100, LEFT_PANEL_LIMITS, 350)).toBe(
      LEFT_PANEL_LIMITS.min,
    );
  });
});

describe("maxPanelWidth", () => {
  it("is the panel's own maximum on a wide window", () => {
    expect(maxPanelWidth(LEFT_PANEL_LIMITS, 304, 3000)).toBe(
      LEFT_PANEL_LIMITS.max,
    );
  });

  it("leaves room for the 3D view on a narrow window", () => {
    expect(maxPanelWidth(LEFT_PANEL_LIMITS, 304, 1100)).toBe(
      1100 - 304 - MIN_VIEWPORT_WIDTH,
    );
  });

  it("never drops below the minimum, even on a tiny window", () => {
    expect(maxPanelWidth(LEFT_PANEL_LIMITS, 304, 500)).toBe(
      LEFT_PANEL_LIMITS.min,
    );
  });
});

describe("parseSavedLayout", () => {
  it("reads valid saved widths", () => {
    expect(parseSavedLayout('{"leftWidth":300,"rightWidth":320}')).toEqual({
      leftWidth: 300,
      rightWidth: 320,
    });
  });

  it("returns null for nothing saved, damaged text or the wrong shape", () => {
    expect(parseSavedLayout(null)).toBeNull();
    expect(parseSavedLayout("not json")).toBeNull();
    expect(parseSavedLayout("{}")).toBeNull();
    expect(parseSavedLayout('{"leftWidth":"wide","rightWidth":1}')).toBeNull();
    expect(parseSavedLayout("null")).toBeNull();
  });
});
