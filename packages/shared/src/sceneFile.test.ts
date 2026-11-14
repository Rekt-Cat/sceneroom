import { describe, expect, it } from "vitest";

// Text to bytes (the shared package is built without the browser's or Node's type library)
const text = globalThis as unknown as {
  TextEncoder: new () => { encode(input: string): Uint8Array };
};
const encode = (input: string) => new text.TextEncoder().encode(input);
import { createEmptyScene, type AssetInfo } from "./scene";
import { addAsset, addNode, createModelNode, createNode } from "./sceneOps";
import {
  MAX_SCENE_FILE_BYTES,
  SCENE_FILE_VERSION,
  decodeSceneFile,
  encodeSceneFile,
  sceneFileName,
} from "./sceneFile";

/** The smallest bytes that pass the GLB check: "glTF", version 2, and the length of the file. */
function glb(extra = 0): Uint8Array {
  const bytes = new Uint8Array(12 + extra);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  return bytes;
}

const info = (id: string, name = "Car"): AssetInfo => ({
  id,
  name,
  type: "model",
  bytes: 12,
  triangles: 3,
  boundsMin: [0, 0, 0],
  boundsMax: [1, 1, 1],
  note: "CC-BY",
});

function sceneWithModels() {
  let scene = createEmptyScene();
  scene = addNode(scene, createNode("cube", "cube"));
  scene = addAsset(scene, info("aaa", "Car"));
  scene = addAsset(scene, info("bbb", "Tree"));
  scene = addNode(scene, createModelNode("m1", "Car", "aaa", 1));
  return scene;
}

/** A packed file with a part of its bytes changed. */
function changed(edit: (bytes: Uint8Array, view: DataView) => void) {
  const { bytes } = encodeSceneFile(sceneWithModels(), {
    aaa: glb(4),
    bbb: glb(8),
  });
  edit(bytes, new DataView(bytes.buffer));
  return decodeSceneFile(bytes);
}

describe("scene file: packing and unpacking", () => {
  it("gives back the same scene and the same model files", () => {
    const scene = sceneWithModels();
    const aaa = glb(4);
    const bbb = glb(8);
    const { bytes, missing } = encodeSceneFile(scene, { aaa, bbb });
    expect(missing).toEqual([]);
    const result = decodeSceneFile(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene).toEqual(scene);
    expect(Array.from(result.assets["aaa"]!)).toEqual(Array.from(aaa));
    expect(Array.from(result.assets["bbb"]!)).toEqual(Array.from(bbb));
  });

  it("a scene with no model files is just the header", () => {
    const scene = addNode(createEmptyScene(), createNode("a", "cube"));
    const { bytes } = encodeSceneFile(scene, {});
    const result = decodeSceneFile(bytes);
    expect(result.ok && result.scene).toEqual(scene);
  });

  it("leaves out files the scene does not mention, and reports files it could not include", () => {
    const { bytes, missing } = encodeSceneFile(sceneWithModels(), {
      aaa: glb(),
      stray: glb(),
    });
    expect(missing).toEqual(["bbb"]);
    const result = decodeSceneFile(bytes);
    expect(result.ok && Object.keys(result.assets)).toEqual(["aaa"]);
  });

  it("keeps everything about every object, such as modifiers, lights and settings", () => {
    let scene = sceneWithModels();
    scene = addNode(scene, {
      ...createNode("bent", "cylinder"),
      segments: 8,
      modifiers: [
        { id: "m", type: "bend", enabled: true, axis: "z", angle: -30 },
      ],
    });
    scene = {
      ...scene,
      environment: { ...scene.environment, fogEnabled: true },
    };
    const { bytes } = encodeSceneFile(scene, { aaa: glb() });
    const result = decodeSceneFile(bytes);
    expect(result.ok && result.scene).toEqual(scene);
  });

  it("names a file after the date", () => {
    expect(sceneFileName(new Date(2026, 10, 4))).toBe(
      "scene-2026-11-04.sceneroom",
    );
  });
});

describe("scene file: refusing bad files", () => {
  const reason = (result: ReturnType<typeof decodeSceneFile>) =>
    result.ok ? "" : result.reason;

  it("not a SceneRoom file", () => {
    expect(reason(decodeSceneFile(new Uint8Array(3)))).toContain("too small");
    expect(reason(decodeSceneFile(encode("hello world, I am text")))).toContain(
      "not a SceneRoom file",
    );
  });

  it("a newer version, with a helpful message", () => {
    const result = changed((_, view) =>
      view.setUint32(4, SCENE_FILE_VERSION + 1, true),
    );
    expect(reason(result)).toContain("newer version");
  });

  it("version 0", () => {
    expect(reason(changed((_, view) => view.setUint32(4, 0, true)))).toContain(
      "bad version",
    );
  });

  it("a header that is too long or empty", () => {
    expect(
      reason(changed((_, view) => view.setUint32(8, 0xffffff, true))),
    ).toContain("header does not fit");
    expect(reason(changed((_, view) => view.setUint32(8, 0, true)))).toContain(
      "header does not fit",
    );
  });

  it("a header that is not JSON, or has the wrong shape", () => {
    expect(reason(changed((bytes) => (bytes[12] = 0x7a)))).toContain(
      "cannot be read",
    );
    const text = encode('{"nope":1}');
    const file = new Uint8Array(12 + text.length);
    file.set(encode("SCNR"), 0);
    new DataView(file.buffer).setUint32(4, 1, true);
    new DataView(file.buffer).setUint32(8, text.length, true);
    file.set(text, 12);
    expect(reason(decodeSceneFile(file))).toContain("wrong shape");
  });

  it("a scene that is not valid, saying where", () => {
    const text = encode(
      JSON.stringify({
        scene: { version: 1, nodes: { a: { id: "a" } } },
        assets: [],
      }),
    );
    const file = new Uint8Array(12 + text.length);
    file.set(encode("SCNR"), 0);
    new DataView(file.buffer).setUint32(4, 1, true);
    new DataView(file.buffer).setUint32(8, text.length, true);
    file.set(text, 12);
    expect(reason(decodeSceneFile(file))).toContain(
      "scene in this file is not valid",
    );
  });

  it("a file that is cut short, or has extra data on the end", () => {
    const { bytes } = encodeSceneFile(sceneWithModels(), {
      aaa: glb(4),
      bbb: glb(8),
    });
    expect(reason(decodeSceneFile(bytes.slice(0, bytes.length - 3)))).toContain(
      "cut short",
    );
    const longer = new Uint8Array(bytes.length + 2);
    longer.set(bytes);
    expect(reason(decodeSceneFile(longer))).toContain("after the end");
  });

  it("a model file that is not a real GLB, naming the model", () => {
    const { bytes } = encodeSceneFile(sceneWithModels(), { aaa: glb(4) });
    // the last model file starts after the header; damage its first letter
    const headerLength = new DataView(bytes.buffer).getUint32(8, true);
    bytes[12 + headerLength] = 0x58;
    expect(reason(decodeSceneFile(bytes))).toContain('The model "Car"');
  });

  it("a file over the size limit is refused before it is read", () => {
    const tooBig = { length: MAX_SCENE_FILE_BYTES + 1 } as Uint8Array;
    expect(reason(decodeSceneFile(tooBig))).toContain("limit");
  });
});
