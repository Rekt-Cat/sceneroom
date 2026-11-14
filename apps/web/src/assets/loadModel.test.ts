import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import {
  ImportError,
  friendlyLoadError,
  importGlbFile,
  loadModelScene,
  measureModel,
  parseGlb,
} from "./loadModel";
import { assetStorage } from "./assetStorage";
import { sha256Hex } from "./hash";

/**
 * A tiny but real GLB: one triangle with corners (0,0,0), (2,0,0) and (0,1,0).
 * Built by hand so the tests need no model file (and no licence to check).
 */
function makeGlb(
  options: { triangles?: number; externalBuffer?: boolean } = {},
): ArrayBuffer {
  const triangles = options.triangles ?? 1;
  const floats: number[] = [];
  for (let i = 0; i < triangles; i++) floats.push(0, 0, 0, 2, 0, 0, 0, 1, 0);
  const binary = new Uint8Array(new Float32Array(floats).buffer);

  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: triangles * 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [2, 1, 0],
      },
    ],
    bufferViews: [{ buffer: 0, byteLength: binary.length }],
    buffers: [
      options.externalBuffer
        ? { uri: "https://example.com/data.bin", byteLength: binary.length }
        : { byteLength: binary.length },
    ],
  };
  let jsonBytes = Uint8Array.from(JSON.stringify(json), (c) => c.charCodeAt(0));
  const padded = Math.ceil(jsonBytes.length / 4) * 4;
  const jsonPadded = new Uint8Array(padded).fill(0x20);
  jsonPadded.set(jsonBytes);
  jsonBytes = jsonPadded;

  const total =
    12 +
    8 +
    jsonBytes.length +
    (options.externalBuffer ? 0 : 8 + binary.length);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  if (!options.externalBuffer) {
    const at = 20 + jsonBytes.length;
    view.setUint32(at, binary.length, true);
    view.setUint32(at + 4, 0x004e4942, true); // "BIN"
    out.set(binary, at + 8);
  }
  return out.buffer;
}

const fileOf = (data: ArrayBuffer, name = "triangle.glb") =>
  new File([data], name);

describe("sha256Hex", () => {
  it("gives the same fingerprint for the same bytes and a different one for different bytes", async () => {
    const a = new Uint8Array([1, 2, 3]).buffer;
    const b = new Uint8Array([1, 2, 4]).buffer;
    expect(await sha256Hex(a)).toBe(await sha256Hex(a.slice(0)));
    expect(await sha256Hex(a)).not.toBe(await sha256Hex(b));
    expect(await sha256Hex(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseGlb and measureModel", () => {
  it("reads a GLB and measures its triangles and the box around it", async () => {
    const root = await parseGlb(makeGlb({ triangles: 2 }));
    const measured = measureModel(root);
    expect(measured?.triangles).toBe(2);
    expect(measured?.boundsMin).toEqual([0, 0, 0]);
    expect(measured?.boundsMax).toEqual([2, 1, 0]);
  });

  it("refuses a model that points at a file on the internet, and does not load it", async () => {
    await expect(parseGlb(makeGlb({ externalBuffer: true }))).rejects.toThrow(
      /outside itself/,
    );
  });

  it("explains a file the loader cannot read", async () => {
    const junk = new Uint8Array(40).fill(7).buffer;
    await expect(parseGlb(junk)).rejects.toBeInstanceOf(ImportError);
  });

  it("an empty scene is not a model", () => {
    expect(measureModel(new Object3D())).toBeNull();
  });
});

describe("friendlyLoadError", () => {
  it("turns known loader complaints into plain sentences", () => {
    expect(
      friendlyLoadError(
        new Error("THREE.GLTFLoader: No DRACOLoader instance provided."),
      ),
    ).toContain("Draco");
    expect(
      friendlyLoadError(
        new Error("THREE.GLTFLoader: setMeshoptDecoder must be called"),
      ),
    ).toContain("Meshopt");
    expect(
      friendlyLoadError(
        new Error("THREE.GLTFLoader: setKTX2Loader must be called"),
      ),
    ).toContain("KTX2");
  });

  it("keeps other messages short", () => {
    const message = friendlyLoadError(
      new Error("THREE.GLTFLoader: " + "x".repeat(500)),
    );
    expect(message.length).toBeLessThan(260);
    expect(message).not.toContain("THREE.GLTFLoader:");
  });
});

describe("importGlbFile", () => {
  it("imports a good file: stores it and returns its details", async () => {
    const data = makeGlb({ triangles: 3 });
    const info = await importGlbFile(fileOf(data, "Little Triangle.glb"));
    expect(info).toMatchObject({
      name: "Little Triangle",
      type: "model",
      bytes: data.byteLength,
      triangles: 3,
      boundsMin: [0, 0, 0],
      boundsMax: [2, 1, 0],
      note: "",
    });
    expect(info.id).toBe(await sha256Hex(data));
    expect(await assetStorage.has(info.id)).toBe(true);
    // and the loaded scene can be fetched again by id
    expect(await loadModelScene(info.id)).toBeDefined();
  });

  it("importing the same file twice gives the same id (stored once)", async () => {
    const a = await importGlbFile(fileOf(makeGlb(), "one.glb"));
    const b = await importGlbFile(fileOf(makeGlb(), "two.glb"));
    expect(a.id).toBe(b.id);
  });

  it("refuses the wrong extension, an empty file and a file that is not a GLB", async () => {
    await expect(importGlbFile(fileOf(makeGlb(), "model.obj"))).rejects.toThrow(
      /not a .glb file/,
    );
    await expect(importGlbFile(new File([], "empty.glb"))).rejects.toThrow(
      /empty/,
    );
    const text = new File(["this is only text, not a model"], "fake.glb");
    await expect(importGlbFile(text)).rejects.toThrow(/not a GLB|too small/);
  });

  it("refuses a file over the size limit, with the sizes in the message", async () => {
    const data = makeGlb();
    await expect(
      importGlbFile(fileOf(data), { maxBytes: 100, maxTriangles: 1000 }),
    ).rejects.toThrow(/limit is/);
  });

  it("refuses a model with too many triangles, and does not store it", async () => {
    const data = makeGlb({ triangles: 5 });
    const id = await sha256Hex(data);
    await expect(
      importGlbFile(fileOf(data), { maxBytes: 1_000_000, maxTriangles: 4 }),
    ).rejects.toThrow(/5 triangles; the limit is 4/);
    expect(await assetStorage.has(id)).toBe(false);
  });

  it("a model that needs outside files is refused with a clear message", async () => {
    await expect(
      importGlbFile(fileOf(makeGlb({ externalBuffer: true }))),
    ).rejects.toThrow(/outside itself/);
  });

  it("the loader reports a missing file instead of failing silently", async () => {
    await expect(loadModelScene("does-not-exist")).rejects.toThrow(/missing/);
  });
});
