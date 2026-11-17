import { beforeEach, describe, expect, it } from "vitest";
import {
  POSE_PRESETS,
  bakeCharacter,
  createEmptyScene,
} from "@sceneroom/shared";
import { MemoryAssetStorage, setAssetStorage } from "@/assets/assetStorage";
import { clearMeshCache, loadMeshData } from "@/assets/meshStorage";
import {
  buildProjectFile,
  openProjectFromFile,
} from "@/sceneFile/sceneFileActions";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { bakeCharacterToMeshes } from "./bakeCharacter";

const get = () => useSceneStore.getState();
const node = (id: string) => get().scene.nodes[id]!;
const message = () => useImportStore.getState().message?.text ?? "";
const children = (id: string) =>
  Object.values(get().scene.nodes).filter((n) => n.parentId === id);

let id: string;

beforeEach(() => {
  setAssetStorage(new MemoryAssetStorage());
  clearMeshCache();
  useImportStore.setState({ busy: false, message: null });
  get().loadScene(createEmptyScene());
  id = get().addCharacter("person");
});

describe("turning a character into meshes", () => {
  it("the character becomes its skin mesh and every other colour a mesh inside it, with the posed points", async () => {
    get().setNodeCharacter(id, { pose: POSE_PRESETS.tpose });
    const baked = bakeCharacter(node(id).character!);
    expect(await bakeCharacterToMeshes(id)).toBe(true);

    expect(node(id)).toMatchObject({
      kind: "mesh",
      character: null,
      name: "Person",
    });
    expect(
      Array.from((await loadMeshData(node(id).assetId!)).positions),
    ).toEqual(Array.from(baked.skin!.positions));
    const parts = children(id);
    expect(parts.map((p) => p.name).sort()).toEqual([
      "Person eyes",
      "Person hair",
      "Person pants",
      "Person shirt",
      "Person shoes",
    ]);
    const shirt = parts.find((p) => p.name === "Person shirt")!;
    expect(shirt.color).toBe("#3d6fb6");
    expect(Array.from((await loadMeshData(shirt.assetId!)).positions)).toEqual(
      Array.from(baked.shirt!.positions),
    );
    expect(message()).toContain("6 editable meshes");
  });

  it("a bald character has no hair mesh", async () => {
    get().setNodeCharacter(id, { hair: "bald" });
    await bakeCharacterToMeshes(id);
    expect(children(id).map((p) => p.name)).not.toContain("Person hair");
    expect(message()).toContain("5 editable meshes");
  });

  it("keeps the place and size, and writes the pose in the notes", async () => {
    get().setNodeTransform(id, {
      position: [4, 0, 5],
      rotation: [0, 1, 0],
      scale: [1.5, 1.5, 1.5],
    });
    get().setNodeCharacter(id, { pose: POSE_PRESETS.walk });
    await bakeCharacterToMeshes(id);
    expect(node(id).transform).toEqual({
      position: [4, 0, 5],
      rotation: [0, 1, 0],
      scale: [1.5, 1.5, 1.5],
    });
    expect(get().scene.assets[node(id).assetId!]!.note).toContain(
      "posed with 9 moved bones",
    );
  });

  it("is one undo step that brings the character back, with all its settings", async () => {
    get().setNodeCharacter(id, { pose: POSE_PRESETS.wave, hair: "long" });
    const before = node(id).character;
    await bakeCharacterToMeshes(id);
    expect(get().history.past.at(-1)?.label).toBe("Make mesh");
    get().undo();
    expect(node(id)).toMatchObject({ kind: "character", character: before });
    expect(children(id)).toHaveLength(0);
    get().redo();
    expect(node(id).kind).toBe("mesh");
  });

  it("does nothing for a locked character or something that is not a character", async () => {
    get().setNodesLocked([id], true);
    await bakeCharacterToMeshes(id);
    expect(node(id).kind).toBe("character");
    expect(await bakeCharacterToMeshes("nope")).toBe(false);
  });
});

describe("characters in saved files", () => {
  it("a crowd of posed characters is saved and opened again unchanged", async () => {
    get().setNodeCharacter(id, { pose: POSE_PRESETS.run });
    get().scatterCharacter(id, [
      { x: 3, z: 1, turn: 0.5, size: 1.05, seed: 5 },
      { x: -3, z: 2, turn: 1.5, size: 0.95, seed: 6 },
    ]);
    const scene = get().scene;
    const { bytes } = await buildProjectFile();
    get().loadScene(createEmptyScene());
    await openProjectFromFile(
      new File([bytes.slice().buffer], "crowd.sceneroom"),
      () => true,
    );
    expect(get().scene).toEqual(scene);
    expect(
      Object.values(get().scene.nodes).filter((n) => n.kind === "character"),
    ).toHaveLength(3);
  });

  it("a character baked into meshes is saved with its mesh data", async () => {
    await bakeCharacterToMeshes(id);
    const scene = get().scene;
    const { bytes, missing } = await buildProjectFile();
    expect(missing).toEqual([]);
    get().loadScene(createEmptyScene());
    setAssetStorage(new MemoryAssetStorage());
    clearMeshCache();
    await openProjectFromFile(
      new File([bytes.slice().buffer], "person.sceneroom"),
      () => true,
    );
    expect(get().scene).toEqual(scene);
    await expect(loadMeshData(node(id).assetId!)).resolves.toBeDefined();
  });
});
