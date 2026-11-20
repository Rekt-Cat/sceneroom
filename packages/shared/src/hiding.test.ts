import { describe, expect, it } from "vitest";
import {
  hiddenPoints,
  topologyFingerprint,
  trianglesToHide,
  trianglesToHideOthers,
  unionTriangles,
  visibleIndices,
} from "./hiding";

// Two squares side by side, sharing the edge 1-4: points 0..5, triangles 0,1 (left square) and 2,3 (right square)
//  0 - 1 - 2
//  | \ | \ |
//  3 - 4 - 5   (drawn flat; the exact diagonals do not matter here)
const indices = [0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2];

describe("trianglesToHide", () => {
  it("Points mode hides every triangle around a selected point", () => {
    expect(trianglesToHide(indices, [0], "point")).toEqual([0, 1]);
    expect(trianglesToHide(indices, [1], "point")).toEqual([1, 2, 3]);
  });
  it("Faces mode hides only triangles whose three corners are selected", () => {
    // The left square selected (points 0, 1, 3, 4): its two triangles go, the right square stays
    expect(trianglesToHide(indices, [0, 1, 3, 4], "face")).toEqual([0, 1]);
    expect(trianglesToHide(indices, [1], "face")).toEqual([]);
  });
  it("hides nothing for an empty selection", () => {
    expect(trianglesToHide(indices, [], "point")).toEqual([]);
  });
});

describe("trianglesToHideOthers", () => {
  it("hides what Hide would leave", () => {
    expect(trianglesToHideOthers(indices, [0, 1, 3, 4], "face")).toEqual([
      2, 3,
    ]);
  });
});

describe("visibleIndices and hiddenPoints", () => {
  it("drops hidden triangles and finds points left with nothing to show them", () => {
    const hidden = new Set([0, 1]);
    expect(Array.from(visibleIndices(indices, hidden))).toEqual([
      1, 4, 5, 1, 5, 2,
    ]);
    // Point 0 and 3 only belong to the hidden square; 1 and 4 are also on the right square
    expect(hiddenPoints(indices, hidden, 6)).toEqual([0, 3]);
  });
  it("never hides a point no triangle uses", () => {
    expect(hiddenPoints(indices, new Set([0, 1, 2, 3]), 7)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });
});

describe("topologyFingerprint", () => {
  it("changes with the triangles or the point count, not with anything else", () => {
    const base = topologyFingerprint(indices, 6);
    expect(topologyFingerprint([...indices], 6)).toBe(base);
    expect(topologyFingerprint(indices, 7)).not.toBe(base);
    expect(topologyFingerprint([...indices.slice(0, 9), 1, 2, 5], 6)).not.toBe(
      base,
    );
  });
});

describe("unionTriangles", () => {
  it("joins two lists without repeats", () => {
    expect(unionTriangles([3, 1], [1, 2])).toEqual([1, 2, 3]);
  });
});
