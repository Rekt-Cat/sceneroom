import { describe, expect, it } from "vitest";
import {
  MAX_MODEL_BYTES,
  TARGET_IMPORT_SIZE,
  assetNameFromFileName,
  checkGlbBytes,
  fitScale,
  modelOffset,
  modelSize,
} from "./assets";
import { NODE_NAME_MAX_LENGTH } from "./scene";

/** The first 12 bytes of a GLB: magic, version, total length. */
function header(magic = 0x46546c67, version = 2, length = 12): Uint8Array {
  const bytes = new Uint8Array(12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, magic, true);
  view.setUint32(4, version, true);
  view.setUint32(8, length, true);
  return bytes;
}

describe("checkGlbBytes", () => {
  it("accepts a header of a version 2 GLB", () => {
    expect(checkGlbBytes(header())).toEqual({ ok: true });
  });

  it("accepts a file that is longer than its declared length (padding)", () => {
    const bytes = new Uint8Array(20);
    bytes.set(header(0x46546c67, 2, 12));
    expect(checkGlbBytes(bytes).ok).toBe(true);
  });

  it("refuses files that are too small, not GLB, another version, or cut short", () => {
    const tooSmall = checkGlbBytes(new Uint8Array(5));
    expect(tooSmall.ok).toBe(false);
    const notGlb = checkGlbBytes(header(0x12345678));
    expect(notGlb).toMatchObject({ ok: false });
    expect(notGlb.ok === false && notGlb.reason).toContain("not a GLB");
    const v1 = checkGlbBytes(header(0x46546c67, 1));
    expect(v1.ok === false && v1.reason).toContain("version 1");
    const cut = checkGlbBytes(header(0x46546c67, 2, 5000));
    expect(cut.ok === false && cut.reason).toContain("cut short");
  });

  it("looks at the bytes, not the name: a text file is refused", () => {
    const text = Uint8Array.from("hello, this is a text file", (c) =>
      c.charCodeAt(0),
    );
    expect(checkGlbBytes(text).ok).toBe(false);
  });

  it("works on a view into a bigger buffer", () => {
    const big = new Uint8Array(40);
    big.set(header(), 8);
    expect(checkGlbBytes(big.subarray(8)).ok).toBe(true);
  });
});

describe("assetNameFromFileName", () => {
  it("drops the folder and the extension", () => {
    expect(assetNameFromFileName("muscle-car.glb")).toBe("muscle-car");
    expect(assetNameFromFileName("C:\\models\\Old Truck.v2.glb")).toBe(
      "Old Truck.v2",
    );
    expect(assetNameFromFileName("/home/me/tree.GLB")).toBe("tree");
  });

  it("falls back to Model and cuts long names", () => {
    expect(assetNameFromFileName(".glb")).toBe("Model");
    expect(assetNameFromFileName("")).toBe("Model");
    expect(assetNameFromFileName("x".repeat(300) + ".glb")).toHaveLength(
      NODE_NAME_MAX_LENGTH,
    );
  });
});

describe("fitting an imported model", () => {
  const car = {
    boundsMin: [-2, 0.2, -5] as [number, number, number],
    boundsMax: [2, 1.8, 5] as [number, number, number],
  };

  it("measures the size", () => {
    expect(modelSize(car)).toEqual([4, 1.6, 10]);
  });

  it("centres it on the ground: middle of the bottom face is the origin", () => {
    expect(modelOffset(car)).toEqual([0, -0.2, 0]);
    // after adding the offset, the lowest point is at 0 and it is centred left-right and front-back
    const [ox, oy, oz] = modelOffset(car);
    expect(car.boundsMin[1] + oy).toBe(0);
    expect(car.boundsMin[0] + ox).toBe(-(car.boundsMax[0] + ox));
    expect(car.boundsMin[2] + oz).toBe(-(car.boundsMax[2] + oz));
  });

  it("scales so the longest side is the target size", () => {
    expect(fitScale(car)).toBeCloseTo(TARGET_IMPORT_SIZE / 10);
    expect(fitScale(car, 20)).toBe(2);
  });

  it("uses scale 1 for a model with no size, so nothing becomes zero or infinite", () => {
    const flat = {
      boundsMin: [0, 0, 0] as [number, number, number],
      boundsMax: [0, 0, 0] as [number, number, number],
    };
    expect(fitScale(flat)).toBe(1);
    const broken = {
      boundsMin: [0, 0, 0] as [number, number, number],
      boundsMax: [Infinity, 0, 0] as [number, number, number],
    };
    expect(fitScale(broken)).toBe(1);
  });

  it("the file size limit is a sensible number of bytes", () => {
    expect(MAX_MODEL_BYTES).toBe(52_428_800);
  });
});
