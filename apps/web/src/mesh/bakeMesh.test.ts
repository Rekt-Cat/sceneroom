import { beforeEach, describe, expect, it } from "vitest";
import {
  addNode,
  createEmptyScene,
  createModifier,
  createNode,
  encodeMeshData,
  type Modifier,
  type Scene,
} from "@sceneroom/shared";
import {
  MemoryAssetStorage,
  assetStorage,
  setAssetStorage,
} from "@/assets/assetStorage";
import { sha256Hex } from "@/assets/hash";
import { clearMeshCache, loadMeshData, storeMesh } from "@/assets/meshStorage";
import {
  buildMeshGeometry,
  buildShapeGeometry,
  geometryToMesh,
} from "@/components/viewport/shapeGeometry";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import {
  buildSceneFile,
  openSceneFromFile,
} from "@/sceneFile/sceneFileActions";
import { bakeNodeToMesh } from "./bakeMesh";

const get = () => useSceneStore.getState();
const node = (id: string) => get().scene.nodes[id]!;

/** A cut-up cube with a bend on it, named like a tree trunk. */
function sceneWithBentCube(): Scene {
  return addNode(createEmptyScene(), {
    ...createNode("trunk", "cube"),
    name: "Trunk",
    color: "#8b5a2b",
    segments: 6,
    modifiers: [{ ...createModifier("m", "bend"), angle: 80 } as Modifier],
    transform: { position: [1, 2, 3], rotation: [0, 0.5, 0], scale: [1, 4, 1] },
  });
}

beforeEach(() => {
  setAssetStorage(new MemoryAssetStorage());
  clearMeshCache();
  useImportStore.setState({ busy: false, message: null });
  get().loadScene(sceneWithBentCube());
});

describe("storing meshes", () => {
  const triangle = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };

  it("stores a mesh under the fingerprint of its bytes, and reads it back from storage", async () => {
    const { id, bytes } = await storeMesh(triangle);
    expect(id).toBe(await sha256Hex(encodeMeshData(triangle).slice().buffer));
    expect(bytes).toBe(encodeMeshData(triangle).length);
    clearMeshCache(); // forget it, so it must come from storage
    const back = await loadMeshData(id);
    expect(Array.from(back.positions)).toEqual(Array.from(triangle.positions));
    expect(Array.from(back.indices)).toEqual(Array.from(triangle.indices));
  });

  it("the same mesh is the same id", async () => {
    expect((await storeMesh(triangle)).id).toBe((await storeMesh(triangle)).id);
  });

  it("a missing or damaged mesh gives a clear message, and can be tried again", async () => {
    await expect(loadMeshData("nope")).rejects.toThrow("missing");
    const { id } = await storeMesh(triangle);
    const bad = new Uint8Array(encodeMeshData(triangle));
    bad[0] = 0x58;
    await assetStorage.put(id, bad.buffer);
    clearMeshCache();
    await expect(loadMeshData(id)).rejects.toThrow("not mesh data");
    await assetStorage.put(id, encodeMeshData(triangle).slice().buffer);
    await expect(loadMeshData(id)).resolves.toBeDefined();
  });

  it("a mesh that is not valid is refused with the reason", async () => {
    await expect(
      storeMesh({
        positions: new Float32Array(9),
        indices: new Uint32Array([0, 1, 7]),
      }),
    ).rejects.toThrow("Cannot store this mesh");
  });
});

describe("Apply modifiers and Convert to mesh", () => {
  it("bakes the bent shape into a mesh that looks the same, keeping the object's place and look", async () => {
    const before = buildShapeGeometry("cube", 6, node("trunk").modifiers);
    const expected = geometryToMesh(before);

    expect(await bakeNodeToMesh("trunk")).toBe(true);
    const trunk = node("trunk");
    expect(trunk).toMatchObject({
      kind: "mesh",
      modifiers: [],
      segments: 1,
      name: "Trunk",
      color: "#8b5a2b",
      transform: {
        position: [1, 2, 3],
        rotation: [0, 0.5, 0],
        scale: [1, 4, 1],
      },
    });
    // the stored mesh has exactly the points the bent shape had
    clearMeshCache();
    const stored = await loadMeshData(trunk.assetId!);
    expect(Array.from(stored.positions)).toEqual(
      Array.from(expected.positions),
    );
    expect(Array.from(stored.indices)).toEqual(Array.from(expected.indices));
    // and the scene records it
    expect(get().scene.assets[trunk.assetId!]).toMatchObject({
      type: "mesh",
      name: "Trunk",
      triangles: expected.indices.length / 3,
    });
    expect(useImportStore.getState().message?.text).toContain("editable mesh");
  });

  it("is one undo step that brings the shape and its modifiers back", async () => {
    await bakeNodeToMesh("trunk");
    expect(get().history.past.at(-1)?.label).toBe("Apply modifiers");
    get().undo();
    expect(node("trunk")).toMatchObject({ kind: "cube", segments: 6 });
    expect(node("trunk").modifiers).toHaveLength(1);
    get().redo();
    expect(node("trunk").kind).toBe("mesh");
    // the mesh data is still stored, so Redo can show it again
    clearMeshCache();
    await expect(loadMeshData(node("trunk").assetId!)).resolves.toBeDefined();
  });

  it("a plain shape becomes a mesh with Convert to mesh", async () => {
    get().loadScene(addNode(createEmptyScene(), createNode("c", "cylinder")));
    await bakeNodeToMesh("c");
    expect(get().history.past.at(-1)?.label).toBe("Convert to mesh");
    const mesh = await loadMeshData(node("c").assetId!);
    expect(mesh.positions.length / 3).toBe(
      buildShapeGeometry("cylinder", 1, []).getAttribute("position").count,
    );
  });

  it("a mesh can get modifiers and be applied again, making a new version and leaving the old", async () => {
    await bakeNodeToMesh("trunk");
    const first = node("trunk").assetId!;
    get().addModifier("trunk", "twist");
    await bakeNodeToMesh("trunk");
    const second = node("trunk").assetId!;
    expect(second).not.toBe(first);
    expect(Object.keys(get().scene.assets).sort()).toEqual(
      [first, second].sort(),
    );
    // the new mesh is the old mesh with the twist applied
    const twisted = buildMeshGeometry(await loadMeshData(first), [
      createModifier("t", "twist"),
    ]);
    const expected = geometryToMesh(twisted);
    const stored = await loadMeshData(second);
    expect(Array.from(stored.positions)).toEqual(
      Array.from(expected.positions),
    );
  });

  it("does nothing for a locked object, a light, or an object that does not exist", async () => {
    get().setNodesLocked(["trunk"], true);
    await bakeNodeToMesh("trunk");
    expect(node("trunk").kind).toBe("cube");
    const light = get().addLight("point");
    expect(await bakeNodeToMesh(light)).toBe(false);
    expect(await bakeNodeToMesh("nope")).toBe(false);
  });
});

describe("meshes in saved files and in the editor", () => {
  it("a scene with a mesh survives Save and Open in a browser that has nothing stored", async () => {
    await bakeNodeToMesh("trunk");
    const meshId = node("trunk").assetId!;
    const scene = get().scene;
    const { bytes, missing } = await buildSceneFile();
    expect(missing).toEqual([]);

    // a fresh browser
    get().loadScene(createEmptyScene());
    setAssetStorage(new MemoryAssetStorage());
    clearMeshCache();
    expect(await assetStorage.has(meshId)).toBe(false);

    await openSceneFromFile(
      new File([bytes.slice().buffer], "trunk.sceneroom"),
      () => true,
    );
    expect(get().scene).toEqual(scene);
    await expect(loadMeshData(meshId)).resolves.toBeDefined();
  });

  it("an old mesh version that only Undo could bring back is not saved", async () => {
    await bakeNodeToMesh("trunk");
    const first = node("trunk").assetId!;
    get().addModifier("trunk", "twist");
    await bakeNodeToMesh("trunk");
    // Undo twice and Redo twice: the scene now uses the second mesh, and still lists the first
    get().undo();
    get().undo();
    get().redo();
    get().redo();
    const used = node("trunk").assetId!;
    expect(used).not.toBe(first);
    const { bytes } = await buildSceneFile();
    // read the header: only the mesh in use is listed
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const header = JSON.parse(
      new TextDecoder().decode(
        bytes.subarray(12, 12 + view.getUint32(8, true)),
      ),
    ) as { assets: { id: string }[] };
    expect(header.assets.map((a) => a.id)).toEqual([used]);
  });

  it("the Assets tab only lists imported models, not meshes", async () => {
    await bakeNodeToMesh("trunk");
    const models = Object.values(get().scene.assets).filter(
      (a) => a.type === "model",
    );
    expect(models).toEqual([]);
    expect(Object.keys(get().scene.assets)).toHaveLength(1);
  });

  it("a duplicate of a mesh object shares the same stored mesh", async () => {
    await bakeNodeToMesh("trunk");
    get().select("trunk");
    get().duplicateSelected();
    const copies = Object.values(get().scene.nodes).filter(
      (n) => n.kind === "mesh",
    );
    expect(copies).toHaveLength(2);
    expect(new Set(copies.map((n) => n.assetId)).size).toBe(1);
  });
});

describe("the record of how a mesh was made", () => {
  const note = (id: string) => get().scene.assets[node(id).assetId!]!.note;

  it("says what the shape was and which modifiers were baked in", async () => {
    await bakeNodeToMesh("trunk");
    expect(note("trunk")).toBe(
      "Made from a cube (6 segments)\nApplied: Bend along Y 80°",
    );
  });

  it("a plain shape only says what it was made from", async () => {
    get().loadScene(addNode(createEmptyScene(), createNode("c", "cylinder")));
    await bakeNodeToMesh("c");
    expect(note("c")).toBe("Made from a cylinder");
  });

  it("only the modifiers that were switched on are written down", async () => {
    get().loadScene(
      addNode(createEmptyScene(), {
        ...createNode("c", "cube"),
        modifiers: [
          { ...createModifier("a", "taper"), amount: 0.25 } as Modifier,
          { ...createModifier("b", "twist"), enabled: false } as Modifier,
        ],
      }),
    );
    await bakeNodeToMesh("c");
    expect(note("c")).toBe("Made from a cube\nApplied: Taper along Y 0.25");
  });

  it("applying again adds a line below the earlier ones and does not repeat where it came from", async () => {
    await bakeNodeToMesh("trunk");
    get().addModifier("trunk", "twist");
    await bakeNodeToMesh("trunk");
    expect(note("trunk")).toBe(
      "Made from a cube (6 segments)\nApplied: Bend along Y 80°\nApplied: Twist around Y 90°",
    );
  });

  it("the record is part of the scene, so it is saved in the file and comes back", async () => {
    await bakeNodeToMesh("trunk");
    const { bytes } = await buildSceneFile();
    get().loadScene(createEmptyScene());
    await openSceneFromFile(
      new File([bytes.slice().buffer], "t.sceneroom"),
      () => true,
    );
    expect(note("trunk")).toContain("Applied: Bend along Y 80°");
  });
});
