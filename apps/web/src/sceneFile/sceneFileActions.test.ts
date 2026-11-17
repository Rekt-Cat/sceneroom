import { beforeEach, describe, expect, it } from "vitest";
import {
  addAsset,
  addNode,
  createEmptyScene,
  createModelNode,
  createNode,
  createProject,
  encodeProjectFile,
  type Project,
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
import { getProject, useProjectStore } from "@/store/projectStore";
import { useSceneStore } from "@/store/sceneStore";
import {
  buildProjectFile,
  importScenesFromFile,
  isSceneFileName,
  openProjectFromFile,
  projectOfScene,
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
const sceneStore = () => useSceneStore.getState();
const nodeIds = () => Object.keys(sceneStore().scene.nodes);

/** Puts a scene in the editor as the only scene of a fresh project. */
function openOnly(scene: Scene) {
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  sceneStore().loadScene(scene);
}

/** A project file with the given scenes, without any model files. */
function projectBytes(
  scenes: Scene[],
  assets: Record<string, Uint8Array> = {},
) {
  let project: Project = createProject("p1", scenes[0]!, "First");
  scenes.slice(1).forEach((scene, i) => {
    project = {
      ...project,
      scenes: [
        ...project.scenes,
        { id: `p${i + 2}`, name: `Scene ${i + 2}`, scene },
      ],
    };
  });
  return encodeProjectFile({ ...project, name: "My game" }, assets).bytes;
}

beforeEach(() => {
  openOnly(createEmptyScene());
  useImportStore.setState({ busy: false, message: null });
});

describe("saving and opening a project file", () => {
  it("brings back the scene and its model files, in a browser that has none of them", async () => {
    const { scene, info } = await sceneWithModel();
    openOnly(scene);
    const { bytes, missing } = await buildProjectFile();
    expect(missing).toEqual([]);

    // a fresh browser: an empty editor and an empty store of model files
    openOnly(createEmptyScene());
    setAssetStorage(new MemoryAssetStorage());
    expect(await assetStorage.has(info.id)).toBe(false);

    await openProjectFromFile(fileOf(bytes), yes);
    expect(sceneStore().scene).toEqual(scene);
    expect(await assetStorage.has(info.id)).toBe(true);
    expect(message()).toMatchObject({ tone: "info" });
    expect(message()?.text).toContain("Opened test.sceneroom");
    // opening starts with a clean undo history and no selection
    expect(sceneStore().selectedIds).toEqual([]);
    expect(sceneStore().history.past).toHaveLength(0);
  });

  it("saves and opens every scene of a project, with the same names and the same open scene", async () => {
    const { scene: withModel, info } = await sceneWithModel();
    openOnly(withModel);
    useProjectStore.getState().addScene("characters");
    sceneStore().addPrimitive("sphere");
    useProjectStore
      .getState()
      .renameScene(useProjectStore.getState().activeSceneId, "NPCs");
    const saved = getProject();
    const { bytes } = await buildProjectFile();

    openOnly(createEmptyScene());
    setAssetStorage(new MemoryAssetStorage());
    await openProjectFromFile(fileOf(bytes), yes);
    expect(getProject()).toEqual(saved);
    expect(await assetStorage.has(info.id)).toBe(true);
    expect(message()?.text).toContain("2 scenes");
  });

  it("a scene saved on its own is a file with one scene, and can be added to another project", async () => {
    const { scene } = await sceneWithModel();
    openOnly(scene);
    useProjectStore.getState().addScene("blank");
    const first = useProjectStore.getState().scenes[0]!;
    const single = projectOfScene(getProject(), first.id)!;
    expect(single.scenes).toHaveLength(1);
    const { bytes } = await buildProjectFile(single);

    await importScenesFromFile(fileOf(bytes, "one.sceneroom"));
    const names = useProjectStore.getState().scenes.map((s) => s.name);
    expect(names).toEqual(["Scene 1", "Blank", "Scene 1 (2)"]);
    // the added scene is open, nothing else changed
    expect(nodeIds()).toHaveLength(2);
    expect(message()?.text).toContain("Added 1 scene from one.sceneroom");
  });

  it("adding scenes from a file keeps the open undo history of the other scenes", async () => {
    const { scene } = await sceneWithModel();
    openOnly(scene);
    sceneStore().addPrimitive("cone");
    const bytes = projectBytes([createEmptyScene()]);
    await importScenesFromFile(fileOf(bytes));
    const firstId = useProjectStore.getState().scenes[0]!.id;
    useProjectStore.getState().switchScene(firstId);
    expect(sceneStore().history.past).toHaveLength(1);
  });

  it("refuses to add scenes past the limit and stores nothing", async () => {
    for (let i = 0; i < 49; i++) useProjectStore.getState().addScene("blank");
    const bytes = projectBytes([createEmptyScene(), createEmptyScene()]);
    await importScenesFromFile(fileOf(bytes));
    expect(useProjectStore.getState().scenes).toHaveLength(50);
    expect(message()).toMatchObject({ tone: "error" });
    expect(message()?.text).toContain("at most 50");
  });

  it("asks before replacing a project that has work in it, and leaves it alone when the answer is no", async () => {
    const { scene } = await sceneWithModel();
    const bytes = projectBytes([scene, createEmptyScene()]);

    openOnly(addNode(createEmptyScene(), createNode("mine", "sphere")));
    let question = "";
    await openProjectFromFile(fileOf(bytes), (q) => {
      question = q;
      return false;
    });
    expect(question).toContain("1 scene, 1 object");
    expect(question).toContain("2 scenes, 2 objects");
    expect(nodeIds()).toEqual(["mine"]);
  });

  it("does not ask when nothing is in the project", async () => {
    const { scene } = await sceneWithModel();
    const bytes = projectBytes([scene]);
    let asked = false;
    await openProjectFromFile(fileOf(bytes), () => {
      asked = true;
      return false;
    });
    expect(asked).toBe(false);
    expect(nodeIds()).toHaveLength(2);
  });

  it("asks when only a scene that is not open has work in it", async () => {
    openOnly(addNode(createEmptyScene(), createNode("mine", "sphere")));
    useProjectStore.getState().addScene("blank"); // open scene is now empty
    let asked = false;
    await openProjectFromFile(
      fileOf(projectBytes([createEmptyScene()])),
      () => {
        asked = true;
        return false;
      },
    );
    expect(asked).toBe(true);
  });

  it("refuses a file that is not a scene file, and leaves the project alone", async () => {
    openOnly(addNode(createEmptyScene(), createNode("mine", "cube")));
    await openProjectFromFile(
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
    expect(nodeIds()).toEqual(["mine"]);
    expect(useImportStore.getState().busy).toBe(false);
  });

  it("refuses a model file whose contents do not match its id", async () => {
    const data = glb(4);
    const info = {
      ...(await infoFor(data, "Fake")),
      id: "not-the-real-fingerprint",
    };
    const scene = addAsset(createEmptyScene(), info);
    const bytes = projectBytes([scene], {
      [info.id]: new Uint8Array(data),
    });
    await openProjectFromFile(fileOf(bytes), yes);
    expect(message()?.text).toContain(
      'the model "Fake" does not match its fingerprint',
    );
    expect(await assetStorage.has("not-the-real-fingerprint")).toBe(false);
    expect(Object.keys(sceneStore().scene.assets)).toEqual([]);
  });

  it("opens a file whose model files are missing, and says which models will be red boxes", async () => {
    const { scene } = await sceneWithModel();
    await openProjectFromFile(fileOf(projectBytes([scene])), yes); // packed without the model file
    expect(nodeIds()).toHaveLength(2);
    expect(message()?.tone).toBe("error");
    expect(message()?.text).toContain("red boxes");
  });

  it("a file saved before projects existed (one scene, version 1) still opens", async () => {
    const scene = addNode(createEmptyScene(), createNode("old", "cube"));
    const header = new TextEncoder().encode(
      JSON.stringify({ scene, assets: [] }),
    );
    const file = new Uint8Array(12 + header.length);
    file.set(new TextEncoder().encode("SCNR"), 0);
    new DataView(file.buffer).setUint32(4, 1, true);
    new DataView(file.buffer).setUint32(8, header.length, true);
    file.set(header, 12);
    await openProjectFromFile(fileOf(file, "old.sceneroom"), yes);
    expect(nodeIds()).toEqual(["old"]);
    expect(useProjectStore.getState().scenes).toHaveLength(1);
  });

  it("a file dropped on the editor is opened when it ends in .sceneroom", async () => {
    const { scene } = await sceneWithModel();
    await importFiles([fileOf(projectBytes([scene]), "dropped.SCENEROOM")]);
    expect(nodeIds()).toHaveLength(2);
    expect(message()?.text).toContain("Opened dropped.SCENEROOM");
  });

  it("recognises the file extension in any case", () => {
    expect(isSceneFileName("a.sceneroom")).toBe(true);
    expect(isSceneFileName("A.SceneRoom")).toBe(true);
    expect(isSceneFileName("a.glb")).toBe(false);
  });
});
