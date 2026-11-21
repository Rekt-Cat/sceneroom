import { describe, expect, it } from "vitest";
import { cornerNormals, startNormalBake } from "./bake";

/** A square in the plane z = 0 from (0,0) to (1,1), its UV map the same square. */
const lowQuad = (uMax = 1) => ({
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  uvs: new Float32Array([0, 0, uMax, 0, uMax, 1, 0, 1]),
});

/** A square covering x from -0.5 to 1.5 (so it spans the low one), at height z = slope * x + offset. */
const ramp = (slope: number, offset: number) => ({
  positions: new Float32Array([
    -0.5,
    -0.5,
    slope * -0.5 + offset,
    1.5,
    -0.5,
    slope * 1.5 + offset,
    1.5,
    1.5,
    slope * 1.5 + offset,
    -0.5,
    1.5,
    slope * -0.5 + offset,
  ]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});

const pixel = (p: Uint8ClampedArray, size: number, x: number, y: number) =>
  Array.from(p.slice((y * size + x) * 4, (y * size + x) * 4 + 4));

function bake(
  low: ReturnType<typeof lowQuad>,
  high: ReturnType<typeof ramp>,
  size = 16,
  distance = 0.5,
) {
  const job = startNormalBake(low, high, { size, distance });
  while (!job.step(10_000)) {
    /* keep going */
  }
  return job;
}

describe("cornerNormals", () => {
  it("keeps the edges of a box sharp: each corner takes its own face's normal", () => {
    // Two faces at 90 degrees sharing an edge (points on the same spots, but separate)
    const positions = new Float32Array([
      0,
      0,
      0,
      1,
      0,
      0,
      1,
      1,
      0, // floor triangle, normal +z
      0,
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      1, // wall triangle, normal -y
    ]);
    const normals = cornerNormals(
      positions,
      new Uint32Array([0, 1, 2, 3, 4, 5]),
    );
    expect(Array.from(normals.slice(0, 3))).toEqual([0, 0, 1]);
    expect(normals[10]).toBeCloseTo(-1);
  });

  it("smooths faces that turn only a little", () => {
    const positions = new Float32Array([
      0,
      0,
      0,
      1,
      0,
      0,
      1,
      1,
      0, // flat, normal +z
      0,
      0,
      0,
      1,
      1,
      0,
      0.5,
      1.5,
      0.5, // turned up a little, sharing the edge from (0,0,0) to (1,1,0)
    ]);
    const normals = cornerNormals(
      positions,
      new Uint32Array([0, 1, 2, 3, 4, 5]),
    );
    // The shared corner at the origin leans between the two faces
    expect(normals[2]).toBeLessThan(1);
    expect(normals[2]).toBeGreaterThan(0.7);
  });
});

describe("startNormalBake", () => {
  it("writes 'no detail' (128, 128, 255) where the high mesh is as flat as the low one", () => {
    const job = bake(lowQuad(), ramp(0, -0.05));
    const p = pixel(job.pixels, 16, 8, 8);
    expect(p[0]).toBeGreaterThanOrEqual(127);
    expect(p[0]).toBeLessThanOrEqual(129);
    expect(p[1]).toBeGreaterThanOrEqual(127);
    expect(p[2]).toBeGreaterThanOrEqual(254);
    expect(job.stats().misses).toBe(0);
    expect(job.stats().hits).toBeGreaterThan(200);
  });

  it("tilts the colour where the high mesh leans: a ramp rising along x turns the normal towards -x", () => {
    const job = bake(lowQuad(), ramp(0.5, -0.2));
    const [r, g, b] = pixel(job.pixels, 16, 8, 8);
    // normal = (-0.5, 0, 1) / sqrt(1.25) = (-0.447, 0, 0.894): red below the middle, green at the middle, blue high
    expect(r!).toBeCloseTo((-0.447 * 0.5 + 0.5) * 255, -1);
    expect(g!).toBeGreaterThanOrEqual(127);
    expect(g!).toBeLessThanOrEqual(129);
    expect(b!).toBeCloseTo((0.894 * 0.5 + 0.5) * 255, -1);
  });

  it("follows the map: flipping v turns the green channel", () => {
    // A ramp rising along y; the map has v pointing up in the picture, like u does along x
    const high = {
      positions: new Float32Array([
        -0.5, -0.5, -0.25, 1.5, -0.5, -0.25, 1.5, 1.5, 0.75, -0.5, 1.5, 0.75,
      ]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    const job = bake(lowQuad(), high);
    const [r, g] = pixel(job.pixels, 16, 8, 8);
    expect(r!).toBeGreaterThanOrEqual(127);
    expect(r!).toBeLessThanOrEqual(129);
    expect(g!).toBeLessThan(110); // normal leans towards -y
  });

  it("leaves the pixel flat and counts a miss when no high surface is in range", () => {
    const job = bake(lowQuad(), ramp(0, -5));
    expect(job.stats().hits).toBe(0);
    expect(job.stats().misses).toBeGreaterThan(200);
    expect(pixel(job.pixels, 16, 8, 8)).toEqual([128, 128, 255, 255]);
  });

  it("does its work in steps and reports progress", () => {
    const job = startNormalBake(lowQuad(), ramp(0.5, -0.2), {
      size: 32,
      distance: 0.5,
    });
    expect(job.progress()).toBe(0);
    expect(job.step(50)).toBe(false);
    const part = job.progress();
    expect(part).toBeGreaterThanOrEqual(0);
    expect(part).toBeLessThan(1);
    while (!job.step(500)) {
      /* keep going */
    }
    expect(job.progress()).toBe(1);
    expect(job.step(10)).toBe(true);
  });

  it("spreads the edge of a map piece a few pixels outwards, and no further", () => {
    // The map covers only the left half of the picture
    const job = startNormalBake(lowQuad(0.5), ramp(0.5, -0.2), {
      size: 32,
      distance: 0.5,
      padding: 3,
    });
    while (!job.step(5_000)) {
      /* keep going */
    }
    const inside = pixel(job.pixels, 32, 8, 16);
    const nearBorder = pixel(job.pixels, 32, 17, 16);
    const far = pixel(job.pixels, 32, 28, 16);
    expect(inside[0]).toBeLessThan(120);
    expect(nearBorder[0]).toBe(inside[0]);
    expect(far).toEqual([128, 128, 255, 255]);
  });
});
