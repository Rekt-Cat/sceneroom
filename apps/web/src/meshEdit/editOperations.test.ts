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
import {
  changeExtrude,
  commitExtrude,
  deleteSelectedPoints,
  previewExtrude,
  extrudeSelectedFaces,
} from "./editOperations";
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
    for (const point of selected) {
      expect(after.positions[point * 3 + 2]).toBeGreaterThan(0.5);
    }
    // ... and it holds EVERY point that sits there: the cap's own 4 and the 8 tops of the walls, so dragging
    // the new face takes its walls with it instead of tearing them off
    const outside: number[] = [];
    for (let i = 0; i < after.positions.length / 3; i++) {
      if (after.positions[i * 3 + 2]! > 0.5) outside.push(i);
    }
    expect(selected.length).toBe(12);
    expect([...selected].sort((a, b) => a - b)).toEqual(outside);
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

describe("changing the settings of the extrusion just made", () => {
  async function extrudeFront() {
    useEditStore.getState().setSelected(await sideSelection(8));
    expect(await extrudeSelectedFaces()).toBe(true);
  }
  const capHeights = async () => {
    const m = await mesh();
    return useEditStore.getState().selected.map((p) => m.positions[p * 3 + 2]!);
  };

  it("keeps the settings of the extrusion in the edit store", async () => {
    await extrudeFront();
    const session = useEditStore.getState().extrude!;
    expect(session.options).toEqual({
      divisions: 1,
      scale: 1,
      twistDegrees: 0,
    });
    expect(session.distance).toBe(session.defaultDistance);
  });

  it("a new scale replaces the extrusion (still ONE undo step) and shrinks the new face", async () => {
    await extrudeFront();
    const stepsAfterExtrude = get().history.past.length;
    expect(await changeExtrude({ scale: 0.5 })).toBe(true);
    expect(get().history.past.length).toBe(stepsAfterExtrude);
    expect(get().history.past.at(-1)?.label).toBe("Extrude");
    const m = await mesh();
    const selected = useEditStore.getState().selected;
    // the selected points are the cap and the tops of the walls; the cap's 4 corners are at half the size
    expect(selected.length).toBe(12);
    const widths = selected.map((p) => Math.abs(m.positions[p * 3]!));
    expect(Math.max(...widths)).toBeCloseTo(0.25, 4);
    // and Undo goes back to the cube in one step
    get().undo();
    expect((await mesh()).positions.length / 3).toBe(24 + 4 * 0 + 0 || 24);
  });

  it("divisions make more bands and keep the cap at the same height", async () => {
    await extrudeFront();
    const before = (await mesh()).indices.length / 3;
    await changeExtrude({ divisions: 3 });
    expect((await mesh()).indices.length / 3).toBe(before + 4 * 2 * 2);
    for (const height of await capHeights())
      expect(height).toBeGreaterThan(0.5);
  });

  it("a longer distance moves the cap further, and the settings are remembered between changes", async () => {
    await extrudeFront();
    await changeExtrude({ scale: 0.5 });
    await changeExtrude({ distance: 2 });
    const session = useEditStore.getState().extrude!;
    expect(session.options.scale).toBe(0.5); // kept
    expect(session.distance).toBe(2);
    const heights = await capHeights();
    expect(Math.max(...heights)).toBeCloseTo(2.5, 4);
  });

  it("the latest of several quick changes wins (a slider being dragged)", async () => {
    await extrudeFront();
    const calls = [
      changeExtrude({ scale: 0.9 }),
      changeExtrude({ scale: 0.7 }),
      changeExtrude({ scale: 0.4 }),
    ];
    await Promise.all(calls);
    // wait for any queued change to finish
    await changeExtrude({});
    expect(useEditStore.getState().extrude!.options.scale).toBe(0.4);
    expect(get().history.past.length).toBe(
      useEditStore.getState().extrude!.pastLength,
    );
  });

  it("is refused, saying why, once something else has been done", async () => {
    await extrudeFront();
    get().addPrimitive("sphere"); // another change: one more undo step
    expect(await changeExtrude({ scale: 0.5 })).toBe(false);
    expect(message()).toContain("right after extruding");
    expect(useEditStore.getState().extrude).toBeNull();
  });

  it("does nothing when no extrusion has been made", async () => {
    expect(await changeExtrude({ scale: 0.5 })).toBe(false);
  });

  it("the extrusion can be extruded again, and each one has its own settings", async () => {
    await extrudeFront();
    await changeExtrude({ scale: 0.5 });
    expect(await extrudeSelectedFaces()).toBe(true);
    const session = useEditStore.getState().extrude!;
    expect(session.options.scale).toBe(1); // a fresh extrusion starts plain
    expect(session.selectedBefore.length).toBeGreaterThan(0);
  });

  it("dragging a setting only previews it: nothing is stored and the scene is not touched, until it is committed", async () => {
    await extrudeFront();
    const assetBefore = node("a").assetId;
    const sceneBefore = get().scene;
    const stepsBefore = get().history.past.length;
    // many ticks of a slider
    for (const scale of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      expect(previewExtrude({ scale })).toBe(true);
    }
    expect(useEditStore.getState().extrude!.options.scale).toBe(0.5);
    // the selection follows the preview (the cap and the tops of the walls), but nothing was stored
    expect(useEditStore.getState().selected.length).toBe(12);
    expect(node("a").assetId).toBe(assetBefore);
    expect(get().scene).toBe(sceneBefore);
    expect(get().history.past.length).toBe(stepsBefore);

    // letting go stores it once, in place of the extrusion (no new undo step)
    expect(await commitExtrude()).toBe(true);
    expect(node("a").assetId).not.toBe(assetBefore);
    expect(get().history.past.length).toBe(stepsBefore);
    const m = await mesh();
    const widths = useEditStore
      .getState()
      .selected.map((p) => Math.abs(m.positions[p * 3]!));
    expect(Math.max(...widths)).toBeCloseTo(0.25, 4);
  });

  it("committing with nothing changed stores the same extrusion again without error", async () => {
    await extrudeFront();
    expect(await commitExtrude()).toBe(true);
  });

  it("a preview is refused once something else was done", async () => {
    await extrudeFront();
    get().addPrimitive("cone");
    expect(previewExtrude({ scale: 0.5 })).toBe(false);
  });
});
