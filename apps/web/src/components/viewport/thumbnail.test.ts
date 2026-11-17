import { describe, expect, it } from "vitest";
import { captureThumbnail, coverRect, setThumbnailSource } from "./thumbnail";

describe("coverRect", () => {
  it("cuts the sides of a wide picture to fit a 16:9 target", () => {
    const r = coverRect(
      { width: 2000, height: 800 },
      { width: 480, height: 270 },
    );
    expect(r.height).toBe(800);
    expect(r.width).toBeCloseTo(800 * (480 / 270));
    expect(r.x).toBeCloseTo((2000 - r.width) / 2);
    expect(r.y).toBe(0);
  });
  it("cuts the top and bottom of a tall picture", () => {
    const r = coverRect(
      { width: 800, height: 1200 },
      { width: 480, height: 270 },
    );
    expect(r.width).toBe(800);
    expect(r.height).toBeCloseTo(800 / (480 / 270));
    expect(r.y).toBeCloseTo((1200 - r.height) / 2);
  });
  it("keeps a picture of the same shape whole", () => {
    expect(
      coverRect({ width: 960, height: 540 }, { width: 480, height: 270 }),
    ).toEqual({
      x: 0,
      y: 0,
      width: 960,
      height: 540,
    });
  });
});

describe("captureThumbnail", () => {
  it("is null with no 3D view, passes the picture on, and survives a failure", () => {
    setThumbnailSource(null);
    expect(captureThumbnail()).toBeNull();
    setThumbnailSource(() => "data:image/jpeg;base64,AA");
    expect(captureThumbnail()).toBe("data:image/jpeg;base64,AA");
    setThumbnailSource(() => {
      throw new Error("no canvas");
    });
    expect(captureThumbnail()).toBeNull();
    setThumbnailSource(null);
  });
});
