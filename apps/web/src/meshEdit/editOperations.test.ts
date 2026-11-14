import { beforeEach, describe, expect, it } from "vitest";
import {
  addNode,
  createEmptyScene,
  createNode,
  expandToWelded,
  flatFacePoints,
  weldGroups,
} from "@sceneroom/shared";
import { MemoryAssetStorage, setAssetStorage } from "@/assets/assetStorage";
import { clearMeshCache, loadMeshData } from "@/assets/meshStorage";
import { useEditStore } from "@/store/editStore";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { commitMesh } from "./commitMeshEdit";
import { deleteSelectedPoints, extrudeSelectedFaces } from "./editOperations";
import { startEditing } from "./startEditing";

const get = () => useSceneStore.getState();
const node = (id: string) => get().scene.nodes[id]!;
const message = () => useImportStore.getState().message?.text ?? "";
const mesh = () => loadMeshData(node("a").assetId!);

beforeEach(async () => {
  setAssetStorage(new MemoryAssetStorage());
  clearMeshCache();
  useEditStore.getState().exit();
  useImportStore.setState({ busy: false, message: null });
  get().loadScene(
    addNode(createEmptyScene(), { ...createNode("a", "cube"), name: "Block" }),
  );
  get().select("a");
  await startEditing("a"); // makes a mesh of the cube and enters edit mode
});

/** The points of one side of the cube, found the way an Alt-click does. */
async function sideSelection(triangle: number): Promise<number[]> {
  const m = await mesh();
  const groups = weldGroups(m.positions);
  return expandToWelded(groups, flatFacePoints(m, triangle, groups));
}

describe("extruding a face of a cube", () => {
  it("makes a new mesh with the face pushed out and walls around it, and selects the new face", async () => {
    const before = await mesh();
    useEditStore.getState().setSelected(await sideSelection(8)); // the +z side
    expect(await extrudeSelectedFaces()).toBe(true);

    const after = await mesh();
    expect(after.indices.length / 3).toBe(
      before.indices.length / 3 - 2 + 2 + 8,
    );
    expect(after.positions.length / 3).toBeGreaterThan(
      before.positions.length / 3,
    );
    // the selection is now the new cap, sitting further out than the old side (z = 0.5)
    const selected = useEditStore.getState().selected;
    expect(selected.length).toBe(4);
    for (const point of selected) {
      expect(after.positions[point * 3 + 2]).toBeGreaterThan(0.5);
    }
    // the scene records the new triangle count and keeps the notes
    const info = get().scene.assets[node("a").assetId!]!;
    expect(info.triangles).toBe(after.indices.length / 3);
    expect(info.name).toBe("Block");
  });

  it("is one undo step that brings the old mesh back", async () => {
    const before = node("a").assetId;
    useEditStore.getState().setSelected(await sideSelection(8));
    await extrudeSelectedFaces();
    expect(get().history.past.at(-1)?.label).toBe("Extrude");
    expect(node("a").assetId).not.toBe(before);
    get().undo();
    expect(node("a").assetId).toBe(before);
    expect(useEditStore.getState().nodeId).toBe("a"); // still editing
  });

  it("can be done again on the new face, making a longer arm", async () => {
    useEditStore.getState().setSelected(await sideSelection(8));
    await extrudeSelectedFaces();
    const once = (await mesh()).indices.length / 3;
    await extrudeSelectedFaces(); // the cap is selected, so it extrudes again
    expect((await mesh()).indices.length / 3).toBe(once - 2 + 2 + 8);
  });

  it("says what to do when no whole face is selected", async () => {
    useEditStore.getState().setSelected([0]);
    expect(await extrudeSelectedFaces()).toBe(false);
    expect(message()).toContain("Select all the points of at least one face");
    expect(useEditStore.getState().selected).toEqual([0]); // the selection is not lost
  });

  it("does nothing when edit mode is off", async () => {
    useEditStore.getState().exit();
    expect(await extrudeSelectedFaces()).toBe(false);
  });

  it("does nothing for a locked object", async () => {
    useEditStore.getState().setSelected(await sideSelection(8));
    const before = node("a").assetId;
    get().setNodesLocked(["a"], true);
    expect(await extrudeSelectedFaces()).toBe(false);
    expect(node("a").assetId).toBe(before);
  });
});

describe("deleting points", () => {
  it("removes the selected points and the faces that use them, with no point left unused", async () => {
    const before = await mesh();
    useEditStore.getState().setSelected(await sideSelection(8));
    expect(await deleteSelectedPoints()).toBe(true);
    const after = await mesh();
    expect(after.indices.length).toBeLessThan(before.indices.length);
    // every point is used by some triangle, and every triangle uses points that exist
    const used = new Set(after.indices);
    expect(used.size).toBe(after.positions.length / 3);
    expect(Math.max(...after.indices)).toBeLessThan(after.positions.length / 3);
    expect(useEditStore.getState().selected).toEqual([]);
    expect(get().history.past.at(-1)?.label).toBe("Delete 12 points");
  });

  it("a point on a corner takes its twins with it (all the points on that spot)", async () => {
    const m = await mesh();
    const groups = weldGroups(m.positions);
    const spotSize = groups.members[groups.ids[0]!]!.length;
    expect(spotSize).toBeGreaterThan(1); // a cube corner is three points
    useEditStore.getState().setSelected([0]);
    await deleteSelectedPoints();
    const after = await mesh();
    // no point is left at the deleted spot
    const gone = [m.positions[0], m.positions[1], m.positions[2]];
    for (let i = 0; i < after.positions.length; i += 3) {
      expect([
        after.positions[i],
        after.positions[i + 1],
        after.positions[i + 2],
      ]).not.toEqual(gone);
    }
  });

  it("is one undo step", async () => {
    const before = node("a").assetId;
    useEditStore.getState().setSelected([0]);
    await deleteSelectedPoints();
    get().undo();
    expect(node("a").assetId).toBe(before);
  });

  it("refuses when nothing is selected, and when it would delete the whole mesh", async () => {
    expect(await deleteSelectedPoints()).toBe(false);
    expect(message()).toContain("Select some points");
    const m = await mesh();
    useEditStore
      .getState()
      .setSelected(Array.from({ length: m.positions.length / 3 }, (_, i) => i));
    const before = node("a").assetId;
    expect(await deleteSelectedPoints()).toBe(false);
    expect(message()).toContain("whole mesh");
    expect(node("a").assetId).toBe(before);
  });
});

describe("storing a mesh whose triangles changed", () => {
  it("commitMesh keeps the name and notes and makes one undo step", async () => {
    const m = await mesh();
    const extra = {
      positions: new Float32Array([...m.positions, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([
        ...m.indices,
        m.positions.length / 3,
        m.positions.length / 3 + 1,
        m.positions.length / 3 + 2,
      ]),
    };
    expect(await commitMesh("a", extra, "Add a triangle")).toBe(true);
    expect(get().history.past.at(-1)?.label).toBe("Add a triangle");
    expect(get().scene.assets[node("a").assetId!]!.triangles).toBe(
      m.indices.length / 3 + 1,
    );
  });

  it("a mesh that is not valid is refused with the reason, and nothing changes", async () => {
    const before = node("a").assetId;
    const bad = {
      positions: new Float32Array(9),
      indices: new Uint32Array([0, 1, 9]),
    };
    expect(await commitMesh("a", bad, "x")).toBe(false);
    expect(node("a").assetId).toBe(before);
    expect(message()).toContain("Could not store the change");
  });
});
