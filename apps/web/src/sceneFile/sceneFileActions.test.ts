import { beforeEach, describe, expect, it } from "vitest";
import {
  addAsset,
  addNode,
  createEmptyScene,
  createModelNode,
  createNode,
  encodeSceneFile,
  type AssetInfo,
  type Scene,
} from "@sceneroom/shared";
import {
  MemoryAssetStorage,
  assetStorage,
  setAssetStorage,
} from "@/assets/assetStorage";
import { sha256Hex } from "@/assets/hash";
import { importFiles } from "@/assets/importFile";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import {
  buildSceneFile,
  isSceneFileName,
  openSceneFromFile,
} from "./sceneFileActions";

/** The smallest bytes that pass the GLB check, with a little extra so different calls differ. */
function glb(extra: number): ArrayBuffer {
  const bytes = new Uint8Array(12 + extra);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  return bytes.buffer;
}

async function infoFor(data: ArrayBuffer, name: string): Promise<AssetInfo> {
  return {
    id: await sha256Hex(data),
    name,
    type: "model",
    bytes: data.byteLength,
    triangles: 3,
    boundsMin: [0, 0, 0],
    boundsMax: [1, 1, 1],
    note: "CC-BY",
  };
}

/** A scene with a cube and a model whose file is in the browser's storage. */
async function sceneWithModel(): Promise<{ scene: Scene; info: AssetInfo }> {
  const data = glb(8);
  const info = await infoFor(data, "Car");
  await assetStorage.put(info.id, data);
  let scene = addNode(createEmptyScene(), createNode("cube", "cube"));
  scene = addAsset(scene, info);
  scene = addNode(scene, createModelNode("car", "Car", info.id, 1));
  return { scene, info };
}

const fileOf = (bytes: Uint8Array, name = "test.sceneroom") =>
  new File([bytes.slice().buffer], name);

const message = () => useImportStore.getState().message;
const yes = () => true;

beforeEach(() => {
  useSceneStore.getState().loadScene(createEmptyScene());
  useImportStore.setState({ busy: false, message: null });
});

describe("saving and opening a scene file", () => {
  it("brings back the scene and its model files, in a browser that has none of them", async () => {
    const { scene, info } = await sceneWithModel();
    useSceneStore.getState().loadScene(scene);
    const { bytes, missing } = await buildSceneFile();
    expect(missing).toEqual([]);

    // a fresh browser: an empty editor and an empty store of model files
    useSceneStore.getState().loadScene(createEmptyScene());
    setAssetStorage(new MemoryAssetStorage());
    expect(await assetStorage.has(info.id)).toBe(false);

    await openSceneFromFile(fileOf(bytes), yes);
    expect(useSceneStore.getState().scene).toEqual(scene);
    expect(await assetStorage.has(info.id)).toBe(true);
    expect(message()).toMatchObject({ tone: "info" });
    expect(message()?.text).toContain("Opened test.sceneroom");
    // opening starts with a clean undo history and no selection
    expect(useSceneStore.getState().selectedIds).toEqual([]);
    expect(useSceneStore.getState().history.past).toHaveLength(0);
  });

  it("asks before replacing a scene that is open, and leaves it alone when the answer is no", async () => {
    const { scene } = await sceneWithModel();
    useSceneStore.getState().loadScene(scene);
    const { bytes } = await buildSceneFile();

    useSceneStore
      .getState()
      .loadScene(addNode(createEmptyScene(), createNode("mine", "sphere")));
    let question = "";
    await openSceneFromFile(fileOf(bytes), (q) => {
      question = q;
      return false;
    });
    expect(question).toContain("(1 object)");
    expect(question).toContain("(2 objects)");
    expect(Object.keys(useSceneStore.getState().scene.nodes)).toEqual(["mine"]);
  });

  it("does not ask when the editor is empty", async () => {
    const { scene } = await sceneWithModel();
    useSceneStore.getState().loadScene(scene);
    const { bytes } = await buildSceneFile();
    useSceneStore.getState().loadScene(createEmptyScene());
    let asked = false;
    await openSceneFromFile(fileOf(bytes), () => {
      asked = true;
      return false;
    });
    expect(asked).toBe(false);
    expect(Object.keys(useSceneStore.getState().scene.nodes)).toHaveLength(2);
  });

  it("refuses a file that is not a scene file, and leaves the open scene alone", async () => {
    useSceneStore
      .getState()
      .loadScene(addNode(createEmptyScene(), createNode("mine", "cube")));
    await openSceneFromFile(
      fileOf(
        new TextEncoder().encode("hello hello hello hello"),
        "notes.sceneroom",
      ),
      yes,
    );
    expect(message()).toMatchObject({ tone: "error" });
    expect(message()?.text).toContain(
      "notes.sceneroom: This is not a SceneRoom file",
    );
    expect(Object.keys(useSceneStore.getState().scene.nodes)).toEqual(["mine"]);
    expect(useImportStore.getState().busy).toBe(false);
  });

  it("refuses a model file whose contents do not match its id", async () => {
    const data = glb(4);
    const info = {
      ...(await infoFor(data, "Fake")),
      id: "not-the-real-fingerprint",
    };
    const scene = addAsset(createEmptyScene(), info);
    const { bytes } = encodeSceneFile(scene, {
      [info.id]: new Uint8Array(data),
    });
    await openSceneFromFile(fileOf(bytes), yes);
    expect(message()?.text).toContain(
      'the model "Fake" does not match its fingerprint',
    );
    expect(await assetStorage.has("not-the-real-fingerprint")).toBe(false);
    expect(Object.keys(useSceneStore.getState().scene.assets)).toEqual([]);
  });

  it("opens a file whose model files are missing, and says which models will be red boxes", async () => {
    const { scene, info } = await sceneWithModel();
    const { bytes } = encodeSceneFile(scene, {}); // packed without the model file
    void info;
    await openSceneFromFile(fileOf(bytes), yes);
    expect(Object.keys(useSceneStore.getState().scene.nodes)).toHaveLength(2);
    expect(message()?.tone).toBe("error");
    expect(message()?.text).toContain("red boxes");
  });

  it("a file dropped on the editor is opened when it ends in .sceneroom", async () => {
    const { scene } = await sceneWithModel();
    const { bytes } = encodeSceneFile(scene, {});
    await importFiles([fileOf(bytes, "dropped.SCENEROOM")]);
    expect(Object.keys(useSceneStore.getState().scene.nodes)).toHaveLength(2);
    expect(message()?.text).toContain("Opened dropped.SCENEROOM");
  });

  it("recognises the file extension in any case", () => {
    expect(isSceneFileName("a.sceneroom")).toBe(true);
    expect(isSceneFileName("A.SceneRoom")).toBe(true);
    expect(isSceneFileName("a.glb")).toBe(false);
  });
});
