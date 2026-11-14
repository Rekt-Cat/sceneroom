import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyScene, generatePlant } from "@sceneroom/shared";
import { MemoryAssetStorage, setAssetStorage } from "@/assets/assetStorage";
import { clearMeshCache, loadMeshData } from "@/assets/meshStorage";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import {
  buildSceneFile,
  openSceneFromFile,
} from "@/sceneFile/sceneFileActions";
import { bakePlantToMeshes } from "./bakePlant";

const get = () => useSceneStore.getState();
const node = (id: string) => get().scene.nodes[id]!;
const message = () => useImportStore.getState().message?.text ?? "";

let treeId: string;

beforeEach(() => {
  setAssetStorage(new MemoryAssetStorage());
  clearMeshCache();
  useImportStore.setState({ busy: false, message: null });
  get().loadScene(createEmptyScene());
  treeId = get().addPlant("tree");
  get().setNodePlant(treeId, { seed: 77 });
});

describe("turning a plant into meshes", () => {
  it("the wood becomes the object and the leaves a mesh inside it, with the points the plant grew", async () => {
    const grown = generatePlant(node(treeId).plant!);
    expect(await bakePlantToMeshes(treeId)).toBe(true);

    const tree = node(treeId);
    expect(tree).toMatchObject({ kind: "mesh", plant: null, name: "Tree" });
    const stored = await loadMeshData(tree.assetId!);
    expect(Array.from(stored.positions)).toEqual(
      Array.from(grown.bark.positions),
    );
    expect(Array.from(stored.indices)).toEqual(Array.from(grown.bark.indices));

    const leaves = Object.values(get().scene.nodes).find(
      (n) => n.parentId === treeId,
    )!;
    expect(leaves).toMatchObject({
      kind: "mesh",
      name: "Tree leaves",
      color: "#4f9a3d",
    });
    const leafData = await loadMeshData(leaves.assetId!);
    expect(Array.from(leafData.positions)).toEqual(
      Array.from(grown.leaves.positions),
    );
    expect(message()).toContain("two editable meshes");
  });

  it("writes the seed in the notes, and keeps the place and size of the plant", async () => {
    get().setNodeTransform(treeId, {
      position: [4, 0, 5],
      rotation: [0, 1, 0],
      scale: [2, 2, 2],
    });
    await bakePlantToMeshes(treeId);
    expect(get().scene.assets[node(treeId).assetId!]!.note).toContain(
      "seed 77",
    );
    expect(node(treeId).transform).toEqual({
      position: [4, 0, 5],
      rotation: [0, 1, 0],
      scale: [2, 2, 2],
    });
  });

  it("is one undo step that brings the plant back, and Redo makes the meshes again", async () => {
    const before = node(treeId).plant;
    await bakePlantToMeshes(treeId);
    expect(get().history.past.at(-1)?.label).toBe("Make mesh");
    get().undo();
    expect(node(treeId)).toMatchObject({ kind: "plant", plant: before });
    expect(
      Object.values(get().scene.nodes).filter((n) => n.parentId === treeId),
    ).toHaveLength(0);
    get().redo();
    expect(node(treeId).kind).toBe("mesh");
  });

  it("a plant with no leaves becomes a single mesh", async () => {
    get().setNodePlant(treeId, { leafDensity: 0 });
    await bakePlantToMeshes(treeId);
    expect(node(treeId).kind).toBe("mesh");
    expect(
      Object.values(get().scene.nodes).filter((n) => n.parentId === treeId),
    ).toHaveLength(0);
    expect(message()).toContain("an editable mesh");
  });

  it("does nothing for a locked plant or something that is not a plant", async () => {
    get().setNodesLocked([treeId], true);
    await bakePlantToMeshes(treeId);
    expect(node(treeId).kind).toBe("plant");
    expect(await bakePlantToMeshes("nope")).toBe(false);
  });
});

describe("plants in saved files", () => {
  it("a scene with plants and a forest is saved and opened again unchanged", async () => {
    get().scatterPlant(treeId, [
      { x: 3, z: 1, turn: 0.5, size: 1.1, seed: 5 },
      { x: -3, z: 2, turn: 1.5, size: 0.9, seed: 6 },
    ]);
    const scene = get().scene;
    const { bytes } = await buildSceneFile();
    get().loadScene(createEmptyScene());
    await openSceneFromFile(
      new File([bytes.slice().buffer], "forest.sceneroom"),
      () => true,
    );
    expect(get().scene).toEqual(scene);
    expect(
      Object.values(get().scene.nodes).filter((n) => n.kind === "plant"),
    ).toHaveLength(3);
  });

  it("a plant baked into meshes is saved with its mesh data", async () => {
    await bakePlantToMeshes(treeId);
    const scene = get().scene;
    const { bytes, missing } = await buildSceneFile();
    expect(missing).toEqual([]);
    get().loadScene(createEmptyScene());
    setAssetStorage(new MemoryAssetStorage());
    clearMeshCache();
    await openSceneFromFile(
      new File([bytes.slice().buffer], "tree.sceneroom"),
      () => true,
    );
    expect(get().scene).toEqual(scene);
    await expect(loadMeshData(node(treeId).assetId!)).resolves.toBeDefined();
  });
});
