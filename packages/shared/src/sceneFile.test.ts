import { describe, expect, it } from "vitest";

// Text to bytes (the shared package is built without the browser's or Node's type library)
const text = globalThis as unknown as {
  TextEncoder: new () => { encode(input: string): Uint8Array };
};
const encode = (input: string) => new text.TextEncoder().encode(input);
import { createEmptyScene, type AssetInfo } from "./scene";
import { encodeMeshData } from "./meshData";
import { addAsset, addNode, createModelNode, createNode } from "./sceneOps";
import {
  MAX_SCENE_FILE_BYTES,
  SCENE_FILE_VERSION,
  decodeProjectFile,
  encodeProjectFile,
  fileSafeName,
  projectAssetIds,
  sceneFileName,
} from "./sceneFile";
import { createPrefab, placePrefab } from "./prefab";
import {
  addProjectScene,
  prefabsUsedByScene,
  addProjectScenes,
  createProject,
  MAX_PROJECT_SCENES,
  type Project,
} from "./project";

// Most tests below are about ONE scene: a project with one scene
const encodeSceneFile = (
  scene: Parameters<typeof createProject>[1],
  assets: Record<string, Uint8Array>,
) => encodeProjectFile(createProject("s1", scene), assets);
type SceneResult =
  | {
      ok: true;
      scene: Project["scenes"][number]["scene"];
      assets: Record<string, Uint8Array>;
    }
  | { ok: false; reason: string };
const decodeSceneFile = (bytes: Uint8Array): SceneResult => {
  const result = decodeProjectFile(bytes);
  if (!result.ok) return result;
  return {
    ok: true,
    scene: result.project.scenes[0]!.scene,
    assets: result.assets,
  };
};

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

describe("scene file: editable meshes", () => {
  const meshData = encodeMeshData({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  });
  const meshInfo = (id: string): AssetInfo => ({
    id,
    name: "Trunk",
    type: "mesh",
    bytes: meshData.length,
    triangles: 1,
    boundsMin: [0, 0, 0],
    boundsMax: [1, 1, 0],
    note: "",
  });
  const sceneWithMesh = (id = "m1") => {
    let scene = addAsset(createEmptyScene(), meshInfo(id));
    scene = addNode(scene, {
      ...createNode("t", "cube"),
      kind: "mesh",
      assetId: id,
    });
    return scene;
  };

  it("packs a mesh with the scene and gives it back, checked", () => {
    const scene = sceneWithMesh();
    const { bytes, missing } = encodeSceneFile(scene, { m1: meshData });
    expect(missing).toEqual([]);
    const result = decodeSceneFile(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene).toEqual(scene);
    expect(Array.from(result.assets["m1"]!)).toEqual(Array.from(meshData));
  });

  it("leaves out a mesh that no object uses (kept in memory only so that Undo works)", () => {
    let scene = sceneWithMesh("used");
    scene = addAsset(scene, meshInfo("old"));
    const { bytes, missing } = encodeSceneFile(scene, {
      used: meshData,
      old: meshData,
    });
    expect(missing).toEqual([]);
    const result = decodeSceneFile(bytes);
    expect(result.ok && Object.keys(result.scene.assets)).toEqual(["used"]);
    expect(result.ok && Object.keys(result.assets)).toEqual(["used"]);
  });

  it("refuses a mesh whose data is damaged, naming it", () => {
    const damaged = new Uint8Array(meshData);
    damaged[0] = 0x58;
    const { bytes } = encodeSceneFile(sceneWithMesh(), { m1: damaged });
    const result = decodeSceneFile(bytes);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('The mesh "Trunk"');
  });
});

describe("project file: several scenes", () => {
  const modelScene = (nodeId: string, assetId: string) => {
    let scene = addAsset(createEmptyScene(), info(assetId, "Car"));
    scene = addNode(scene, createModelNode(nodeId, "Car", assetId, 1));
    return scene;
  };
  const twoScenes = (): Project => {
    const first = createProject("a", modelScene("m1", "aaa"), "Town");
    return addProjectScene(
      { ...first, name: "My game" },
      { id: "b", name: "NPCs", scene: modelScene("m2", "aaa") },
    );
  };

  it("gives back the same project: names, order, which scene is open, every scene", () => {
    const project = { ...twoScenes(), activeSceneId: "b" };
    const { bytes, missing } = encodeProjectFile(project, { aaa: glb(4) });
    expect(missing).toEqual([]);
    const result = decodeProjectFile(bytes);
    expect(result.ok && result.project).toEqual(project);
  });

  it("stores a file used by two scenes ONCE", () => {
    const big = glb(20000);
    const one = encodeProjectFile(createProject("a", modelScene("m1", "aaa")), {
      aaa: big,
    });
    const two = encodeProjectFile(twoScenes(), { aaa: big });
    const result = decodeProjectFile(two.bytes);
    expect(result.ok && Object.keys(result.assets)).toEqual(["aaa"]);
    // the second scene adds only its few objects (a little text), not another 20 000 bytes
    expect(two.bytes.length - one.bytes.length).toBeLessThan(5000);
    expect(projectAssetIds(twoScenes())).toEqual(["aaa"]);
  });

  it("reports a file that is missing once, however many scenes use it", () => {
    const { missing } = encodeProjectFile(twoScenes(), {});
    expect(missing).toEqual(["aaa"]);
  });

  it("a mesh nobody uses is left out of every scene", () => {
    const meshData = encodeMeshData({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    });
    const old: AssetInfo = {
      id: "old",
      name: "Old",
      type: "mesh",
      bytes: meshData.length,
      triangles: 1,
      boundsMin: [0, 0, 0],
      boundsMax: [1, 1, 0],
      note: "",
    };
    const project = createProject("a", addAsset(createEmptyScene(), old));
    const { bytes } = encodeProjectFile(project, { old: meshData });
    const result = decodeProjectFile(bytes);
    expect(result.ok && result.project.scenes[0]?.scene.assets).toEqual({});
    expect(result.ok && Object.keys(result.assets)).toEqual([]);
  });

  it("names the scene that is not valid", () => {
    const text = encode(
      JSON.stringify({
        project: {
          ...twoScenes(),
          scenes: [
            twoScenes().scenes[0],
            {
              id: "b",
              name: "Bad",
              scene: { version: 1, nodes: { x: { id: "x" } } },
            },
          ],
        },
        assets: [],
      }),
    );
    const file = new Uint8Array(12 + text.length);
    file.set(encode("SCNR"), 0);
    new DataView(file.buffer).setUint32(4, 2, true);
    new DataView(file.buffer).setUint32(8, text.length, true);
    file.set(text, 12);
    const result = decodeProjectFile(file);
    expect(!result.ok && result.reason).toContain(
      "project in this file is not valid",
    );
    expect(!result.ok && result.reason).toContain("scenes.1");
  });

  it("refuses a project whose open scene is not in it", () => {
    const text = encode(
      JSON.stringify({
        project: { ...twoScenes(), activeSceneId: "zzz" },
        assets: [],
      }),
    );
    const file = new Uint8Array(12 + text.length);
    file.set(encode("SCNR"), 0);
    new DataView(file.buffer).setUint32(4, 2, true);
    new DataView(file.buffer).setUint32(8, text.length, true);
    file.set(text, 12);
    const result = decodeProjectFile(file);
    expect(!result.ok && result.reason).toContain(
      "open scene is not in the project",
    );
  });

  it("a version 1 file (one scene) opens as a project with one scene", () => {
    const scene = addNode(createEmptyScene(), createNode("a", "cube"));
    const text = encode(JSON.stringify({ scene, assets: [] }));
    const file = new Uint8Array(12 + text.length);
    file.set(encode("SCNR"), 0);
    new DataView(file.buffer).setUint32(4, 1, true);
    new DataView(file.buffer).setUint32(8, text.length, true);
    file.set(text, 12);
    const result = decodeProjectFile(file);
    expect(result.ok && result.project.scenes).toHaveLength(1);
    expect(result.ok && result.project.scenes[0]?.scene).toEqual(scene);
    expect(result.ok && result.project.activeSceneId).toBe(
      result.ok && result.project.scenes[0]?.id,
    );
  });

  it("a model used only by the second scene is checked too, naming it", () => {
    const first = createProject("a", createEmptyScene());
    const project = addProjectScene(first, {
      id: "b",
      name: "Two",
      scene: modelScene("m", "aaa"),
    });
    const { bytes } = encodeProjectFile(project, { aaa: glb(4) });
    const headerLength = new DataView(bytes.buffer).getUint32(8, true);
    bytes[12 + headerLength] = 0x58;
    const result = decodeProjectFile(bytes);
    expect(!result.ok && result.reason).toContain('The model "Car"');
  });
});

describe("adding scenes from a file to a project", () => {
  const scene = (name: string) => ({
    id: "old-id",
    name,
    scene: createEmptyScene(),
  });

  it("gives them new ids and unique names, in order", () => {
    const project = createProject("a", createEmptyScene(), "Town");
    let n = 0;
    const { project: next, addedIds } = addProjectScenes(
      project,
      [scene("Town"), scene("Town")],
      () => `new-${++n}`,
    );
    expect(addedIds).toEqual(["new-1", "new-2"]);
    expect(next.scenes.map((s) => [s.id, s.name])).toEqual([
      ["a", "Town"],
      ["new-1", "Town (2)"],
      ["new-2", "Town (3)"],
    ]);
  });

  it("refuses to go past the limit, changing nothing", () => {
    let project = createProject("a", createEmptyScene());
    for (let i = 1; i < MAX_PROJECT_SCENES - 1; i++) {
      project = addProjectScene(project, {
        id: `x${i}`,
        name: `S${i}`,
        scene: createEmptyScene(),
      });
    }
    expect(() =>
      addProjectScenes(project, [scene("A"), scene("B")], () => "n"),
    ).toThrow(/at most/);
  });
});

describe("file names", () => {
  it("makes a name safe for a file", () => {
    expect(fileSafeName("Town (2)")).toBe("town-2");
    expect(fileSafeName("Café ¡Bonito!")).toBe("cafe-bonito");
    expect(fileSafeName("???", "scene")).toBe("scene");
    expect(fileSafeName("a/b\\c:d")).toBe("a-b-c-d");
    expect(fileSafeName("x".repeat(100))).toHaveLength(40);
  });

  it("puts the name and the date in the file name", () => {
    expect(sceneFileName(new Date(2026, 10, 4), "My Game")).toBe(
      "my-game-2026-11-04.sceneroom",
    );
  });
});

describe("project file: prefabs", () => {
  function projectWithPrefab(): Project {
    let source = addAsset(createEmptyScene(), info("aaa", "Car"));
    source = addNode(source, createModelNode("car", "Car", "aaa", 1));
    const prefab = createPrefab(source, "car", "p1")!;
    const other = placePrefab(createEmptyScene(), prefab, "i1", () => "x1");
    const project = createProject("a", other, "Town");
    return { ...project, prefabs: { p1: prefab } };
  }

  it("keeps the prefabs and the files only a prefab uses", () => {
    const project = projectWithPrefab();
    // the scene itself has the model (placing adds its record), but check the prefab alone as well
    const bare: Project = {
      ...project,
      scenes: [{ ...project.scenes[0]!, scene: createEmptyScene() }],
    };
    expect(projectAssetIds(bare)).toEqual(["aaa"]);
    const { bytes, missing } = encodeProjectFile(bare, { aaa: glb(4) });
    expect(missing).toEqual([]);
    const result = decodeProjectFile(bytes);
    expect(result.ok && result.project).toEqual(bare);
    expect(result.ok && Object.keys(result.assets)).toEqual(["aaa"]);
  });

  it("checks a file used only by a prefab like any other, naming it", () => {
    const project = projectWithPrefab();
    const bare: Project = {
      ...project,
      scenes: [{ ...project.scenes[0]!, scene: createEmptyScene() }],
    };
    const { bytes } = encodeProjectFile(bare, { aaa: glb(4) });
    const headerLength = new DataView(bytes.buffer).getUint32(8, true);
    bytes[12 + headerLength] = 0x58;
    const result = decodeProjectFile(bytes);
    expect(!result.ok && result.reason).toContain('The model "Car"');
  });

  it("a project saved before prefabs existed opens with none", () => {
    const project = createProject("a", createEmptyScene());
    const { prefabs, ...old } = project;
    void prefabs;
    const text = encode(JSON.stringify({ project: old, assets: [] }));
    const file = new Uint8Array(12 + text.length);
    file.set(encode("SCNR"), 0);
    new DataView(file.buffer).setUint32(4, 2, true);
    new DataView(file.buffer).setUint32(8, text.length, true);
    file.set(text, 12);
    const result = decodeProjectFile(file);
    expect(result.ok && result.project.prefabs).toEqual({});
  });

  it("refuses a prefab stored under the wrong id", () => {
    const project = projectWithPrefab();
    const text = encode(
      JSON.stringify({
        project: { ...project, prefabs: { wrong: project.prefabs["p1"] } },
        assets: [],
      }),
    );
    const file = new Uint8Array(12 + text.length);
    file.set(encode("SCNR"), 0);
    new DataView(file.buffer).setUint32(4, 2, true);
    new DataView(file.buffer).setUint32(8, text.length, true);
    file.set(text, 12);
    const result = decodeProjectFile(file);
    expect(!result.ok && result.reason).toContain("wrong id");
  });

  it("finds the prefabs a scene is linked to", () => {
    const project = projectWithPrefab();
    expect(
      Object.keys(prefabsUsedByScene(project, project.scenes[0]!.scene)),
    ).toEqual(["p1"]);
    expect(prefabsUsedByScene(project, createEmptyScene())).toEqual({});
  });
});
