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
import { commitMesh, commitMeshPositions } from "./commitMeshEdit";
import { buildTopology, createModifier } from "@sceneroom/shared";
import { buildMeshGeometry } from "@/components/viewport/shapeGeometry";
import {
  CREASE_SHARP,
  CREASE_SOFT,
  changeExtrude,
  changeLoopCut,
  bevelSelectedEdges,
  seamSelectedEdges,
  changeDivide,
  commitDivide,
  divideSelectedFaces,
  previewDivide,
  bridgeSelectedLoops,
  fillSelectedHole,
  flipSelectedNormals,
  mergeSelectedPoints,
  weldSelectedPoints,
  changeBevel,
  commitBevel,
  previewBevel,
  creaseSelectedEdges,
  commitExtrude,
  commitLoopCut,
  previewLoopCut,
  startLoopCut,
  deleteSelectedPoints,
  previewExtrude,
  extrudeSelectedFaces,
  insetSelectedFaces,
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

describe("loop cut on a cube", () => {
  /** The first edge of the cube as the first point of each end (what the viewport passes when an edge is clicked). */
  async function anEdge(): Promise<[number, number]> {
    const t = buildTopology(await mesh());
    return [t.vertexPoints[t.edges[0]!]![0]!, t.vertexPoints[t.edges[1]!]![0]!];
  }
  const triangleCount = async () => (await mesh()).indices.length / 3;

  it("cuts a ring round the cube: 4 squares split, so 8 more triangles, as one undo step", async () => {
    const before = await triangleCount();
    const stepsBefore = get().history.past.length;
    expect(await startLoopCut(await anEdge())).toBe(true);
    expect(await triangleCount()).toBe(before + 8);
    expect(get().history.past.length).toBe(stepsBefore + 1);
    expect(get().history.past.at(-1)?.label).toBe("Loop cut");
    // the new points are selected (8 spots, 2 points each where two sides meet)
    expect(useEditStore.getState().selected.length).toBeGreaterThanOrEqual(8);
    expect(useEditStore.getState().loopCutMode).toBe(false);
    get().undo();
    expect(await triangleCount()).toBe(before);
  });

  it("the cut works on a plain cube, with no Segments needed", async () => {
    expect((await mesh()).positions.length / 3).toBe(24);
    expect(await startLoopCut(await anEdge())).toBe(true);
    // the cube still closes: every edge of the result has two faces
    const t = buildTopology(await mesh());
    expect(t.edgeFaces.every((faces) => faces.length === 2)).toBe(true);
  });

  it("a new number of cuts replaces the cut in place (still one undo step)", async () => {
    await startLoopCut(await anEdge());
    const steps = get().history.past.length;
    const before = (await triangleCount()) - 8;
    expect(await changeLoopCut({ cuts: 3 })).toBe(true);
    expect(get().history.past.length).toBe(steps);
    expect(await triangleCount()).toBe(before + 4 * 2 * 3);
    expect(useEditStore.getState().loopCut!.options.cuts).toBe(3);
  });

  it("dragging a setting only previews it; letting go stores it once", async () => {
    await startLoopCut(await anEdge());
    const asset = node("a").assetId;
    for (const cuts of [2, 3, 4]) expect(previewLoopCut({ cuts })).toBe(true);
    expect(node("a").assetId).toBe(asset);
    expect(await commitLoopCut()).toBe(true);
    expect(node("a").assetId).not.toBe(asset);
    expect(useEditStore.getState().loopCut!.options.cuts).toBe(4);
  });

  it("is refused, saying why, once something else was done", async () => {
    await startLoopCut(await anEdge());
    get().addPrimitive("cone");
    expect(previewLoopCut({ cuts: 2 })).toBe(false);
    expect(await changeLoopCut({ cuts: 2 })).toBe(false);
    expect(message()).toContain("right after cutting");
    expect(useEditStore.getState().loopCut).toBeNull();
  });

  it("says why when there is no strip of squares to cut", async () => {
    // a mesh of one triangle: make the cube's mesh a triangle by deleting almost everything is awkward, so
    // ask for an edge that is not there
    expect(await startLoopCut([9999, 9998])).toBe(false);
    expect(message()).toContain("no longer there");
  });
});

describe("inset and pushing in", () => {
  async function insetFront() {
    useEditStore.getState().setSelected(await sideSelection(8));
    expect(await insetSelectedFaces()).toBe(true);
  }
  const heights = async () => {
    const m = await mesh();
    return useEditStore.getState().selected.map((p) => m.positions[p * 3 + 2]!);
  };

  it("an inset makes a smaller face in the same place, as one undo step labelled Inset", async () => {
    const before = (await mesh()).indices.length / 3;
    const steps = get().history.past.length;
    await insetFront();
    expect((await mesh()).indices.length / 3).toBe(before + 8);
    expect(get().history.past.length).toBe(steps + 1);
    expect(get().history.past.at(-1)?.label).toBe("Inset");
    const session = useEditStore.getState().extrude!;
    expect(session.kind).toBe("inset");
    expect(session.distance).toBe(0);
    expect(session.options.scale).toBe(0.75);
    // the new face is level with the old one (z = 0.5) and smaller (the cube side is 1 wide)
    for (const h of await heights()) expect(h).toBeCloseTo(0.5, 5);
    const m = await mesh();
    const widths = useEditStore
      .getState()
      .selected.map((p) => Math.abs(m.positions[p * 3]!));
    expect(Math.max(...widths)).toBeCloseTo(0.375, 4);
  });

  it("the Depth setting pushes the inset face out or in, and the Face size setting changes the border", async () => {
    await insetFront();
    await changeExtrude({ distance: 0.3 });
    for (const h of await heights()) expect(h).toBeCloseTo(0.8, 4);
    await changeExtrude({ distance: -0.2 });
    for (const h of await heights()) expect(h).toBeCloseTo(0.3, 4);
    await changeExtrude({ scale: 0.5 });
    const m = await mesh();
    const widths = useEditStore
      .getState()
      .selected.map((p) => Math.abs(m.positions[p * 3]!));
    expect(Math.max(...widths)).toBeCloseTo(0.25, 4);
    // the label of the amended step stays Inset
    expect(get().history.past.at(-1)?.label).toBe("Inset");
  });

  it("an extrusion can be pushed IN with a negative distance", async () => {
    useEditStore.getState().setSelected(await sideSelection(8));
    await extrudeSelectedFaces();
    await changeExtrude({ distance: -0.3 });
    for (const h of await heights()) expect(h).toBeCloseTo(0.2, 4);
  });

  it("the reset values of an inset are its starting values, not the extrude ones", async () => {
    await insetFront();
    const session = useEditStore.getState().extrude!;
    expect(session.defaultDistance).toBe(0);
    expect(session.defaultOptions.scale).toBe(0.75);
  });

  it("refuses with a reason when no face is selected", async () => {
    useEditStore.getState().setSelected([]);
    expect(await insetSelectedFaces()).toBe(false);
    expect(message()).toContain("Select all the points of at least one face");
  });
});

describe("edge creases", () => {
  /** Selects an edge of the cube by its two end points (what clicking it does). */
  async function selectAnEdge(): Promise<[number, number]> {
    const t = buildTopology(await mesh());
    const [a, b] = [t.vertexPoints[t.edges[0]!]!, t.vertexPoints[t.edges[1]!]!];
    useEditStore.getState().setSelected([...a, ...b]);
    return [a[0]!, b[0]!];
  }

  it("marks the selected edge as sharp: stored with the mesh, one undo step, and Undo takes it away", async () => {
    await selectAnEdge();
    const steps = get().history.past.length;
    expect(await creaseSelectedEdges(CREASE_SHARP)).toBe(true);
    expect(get().history.past.length).toBe(steps + 1);
    expect(get().history.past.at(-1)?.label).toBe("Crease edges");
    const m = await mesh();
    expect(m.creases).toHaveLength(1);
    expect(m.creases![0]!.value).toBe(1);
    get().undo();
    expect((await mesh()).creases).toBeUndefined();
  });

  it("a softer value, then clearing", async () => {
    await selectAnEdge();
    await creaseSelectedEdges(CREASE_SOFT);
    expect((await mesh()).creases![0]!.value).toBeCloseTo(0.5, 2);
    expect(get().history.past.at(-1)?.label).toBe("Soften crease");
    await creaseSelectedEdges(0);
    expect((await mesh()).creases).toBeUndefined();
    expect(get().history.past.at(-1)?.label).toBe("Clear crease");
  });

  it("doing the same again changes nothing and adds no undo step", async () => {
    await selectAnEdge();
    await creaseSelectedEdges(CREASE_SHARP);
    const steps = get().history.past.length;
    expect(await creaseSelectedEdges(CREASE_SHARP)).toBe(true);
    expect(get().history.past.length).toBe(steps);
  });

  it("says what to do when no edge is selected", async () => {
    useEditStore.getState().setSelected([]);
    expect(await creaseSelectedEdges(CREASE_SHARP)).toBe(false);
    expect(message()).toContain("Select an edge first");
  });

  it("creases survive moving a point", async () => {
    await selectAnEdge();
    await creaseSelectedEdges(CREASE_SHARP);
    // moving a point keeps the crease (the triangles and creases are carried along)
    const m0 = await mesh();
    const moved = Float32Array.from(m0.positions);
    moved[0] = moved[0]! + 0.1;
    const { commitMeshPositions } = await import("./commitMeshEdit");
    await commitMeshPositions("a", moved, "Move point");
    expect((await mesh()).creases).toHaveLength(1);
  });

  it("with every edge creased, Smooth keeps the cube's corners; without creases it rounds them", async () => {
    const all = Array.from(
      { length: (await mesh()).positions.length / 3 },
      (_, i) => i,
    );
    useEditStore.getState().setSelected(all);
    expect(await creaseSelectedEdges(CREASE_SHARP)).toBe(true);
    expect((await mesh()).creases).toHaveLength(12);

    const farthest = (g: ReturnType<typeof buildMeshGeometry>) => {
      const p = g.getAttribute("position");
      let far = 0;
      for (let i = 0; i < p.count; i++)
        far = Math.max(far, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
      return far;
    };
    const smooth = [createModifier("s", "subdivide")];
    const creased = buildMeshGeometry(await mesh(), smooth);
    expect(farthest(creased)).toBeCloseTo(Math.hypot(0.5, 0.5, 0.5), 4);

    get().undo(); // takes the creases away again
    const soft = buildMeshGeometry(await mesh(), smooth);
    expect(farthest(soft)).toBeLessThan(0.6);
  });

  it("a loop cut across a creased edge keeps the crease on both halves, and the extrusion keeps it too", async () => {
    await selectAnEdge();
    await creaseSelectedEdges(CREASE_SHARP);
    const t0 = buildTopology(await mesh());
    const creaseA = (await mesh()).creases![0]!;
    // cut across the strip that contains the creased edge as a rung: the edge is split into two
    const edge = [t0.vertexOf[creaseA.a]!, t0.vertexOf[creaseA.b]!] as const;
    const ring = [
      t0.vertexPoints[edge[0]]![0]!,
      t0.vertexPoints[edge[1]]![0]!,
    ] as [number, number];
    expect(await startLoopCut(ring)).toBe(true);
    const m = await mesh();
    expect(m.creases!.length).toBeGreaterThanOrEqual(2);
    expect(m.creases!.every((c) => c.value === 1)).toBe(true);
  });
});

describe("bevel", () => {
  async function selectAnEdge() {
    const t = buildTopology(await mesh());
    const [a, b] = [t.vertexPoints[t.edges[0]!]!, t.vertexPoints[t.edges[1]!]!];
    useEditStore.getState().setSelected([...a, ...b]);
  }
  const closed = async () =>
    buildTopology(await mesh()).edgeFaces.every((f) => f.length === 2);

  it("bevels the selected edge as one undo step and keeps the cube closed", async () => {
    await selectAnEdge();
    const steps = get().history.past.length;
    expect(await bevelSelectedEdges()).toBe(true);
    expect(get().history.past.length).toBe(steps + 1);
    expect(get().history.past.at(-1)?.label).toBe("Bevel");
    expect(await closed()).toBe(true);
    get().undo();
    expect((await mesh()).indices.length / 3).toBe(12);
  });

  it("changing segments replaces the bevel in place", async () => {
    await selectAnEdge();
    await bevelSelectedEdges();
    const steps = get().history.past.length;
    expect(await changeBevel({ segments: 4 })).toBe(true);
    expect(get().history.past.length).toBe(steps);
    expect(useEditStore.getState().bevel!.segments).toBe(4);
    expect(await closed()).toBe(true);
  });

  it("dragging previews; letting go stores once", async () => {
    await selectAnEdge();
    await bevelSelectedEdges();
    const asset = node("a").assetId;
    for (const w of [0.02, 0.05, 0.08])
      expect(previewBevel({ width: w })).toBe(true);
    expect(node("a").assetId).toBe(asset);
    expect(await commitBevel()).toBe(true);
    expect(node("a").assetId).not.toBe(asset);
  });

  it("asks for an edge when nothing is selected", async () => {
    expect(await bevelSelectedEdges()).toBe(false);
    expect(message()).toContain("Select an edge");
  });
});

describe("extruding an edge", () => {
  async function selectAnEdge() {
    const t = buildTopology(await mesh());
    const [a, b] = [t.vertexPoints[t.edges[0]!]!, t.vertexPoints[t.edges[1]!]!];
    useEditStore.getState().setSelected([...a, ...b]);
  }

  it("Extrude with only an edge selected makes a fin: 2 triangles, one undo step, settings follow", async () => {
    await selectAnEdge();
    const before = (await mesh()).indices.length / 3;
    const steps = get().history.past.length;
    expect(await extrudeSelectedFaces()).toBe(true);
    expect((await mesh()).indices.length / 3).toBe(before + 2);
    expect(get().history.past.length).toBe(steps + 1);
    expect(useEditStore.getState().extrude!.edges).toBe(true);
    expect(await changeExtrude({ divisions: 3 })).toBe(true);
    expect((await mesh()).indices.length / 3).toBe(before + 6);
    expect(get().history.past.length).toBe(steps + 1);
  });
});

describe("fixing up a mesh", () => {
  const pointTotal = async () => (await mesh()).positions.length / 3;

  it("flipping with nothing selected turns the whole cube inside out, as one undo step", async () => {
    const before = Array.from((await mesh()).indices);
    const steps = get().history.past.length;
    expect(await flipSelectedNormals()).toBe(true);
    expect(get().history.past.length).toBe(steps + 1);
    expect(get().history.past.at(-1)?.label).toBe("Flip all faces");
    expect(Array.from((await mesh()).indices)).not.toEqual(before);
    get().undo();
    expect(Array.from((await mesh()).indices)).toEqual(before);
  });

  it("welding every point of the cube joins its separate sides: 24 points become 8", async () => {
    expect(await pointTotal()).toBe(24);
    useEditStore
      .getState()
      .setSelected(Array.from({ length: 24 }, (_, i) => i));
    expect(await weldSelectedPoints()).toBe(true);
    expect(await pointTotal()).toBe(8);
    expect(get().history.past.at(-1)?.label).toBe("Weld points");
  });

  it("merging two points of the cube leaves one point there and selects it", async () => {
    const t = buildTopology(await mesh());
    const a = t.vertexPoints[t.edges[0]!]!;
    const b = t.vertexPoints[t.edges[1]!]!;
    useEditStore.getState().setSelected([...a, ...b]);
    expect(await mergeSelectedPoints()).toBe(true);
    expect(useEditStore.getState().selected.length).toBeGreaterThan(0);
    expect(get().history.past.at(-1)?.label).toBe("Merge points");
  });

  it("says why when it cannot: nothing to merge, no hole to fill, nothing to bridge", async () => {
    expect(await mergeSelectedPoints()).toBe(false);
    expect(message()).toContain("two separate points");
    expect(await fillSelectedHole()).toBe(false);
    expect(message()).toContain("no holes");
    expect(await bridgeSelectedLoops()).toBe(false);
    expect(message()).toContain("two open rims");
  });
});

describe("deleting a face and filling the hole again", () => {
  it("in Faces mode only that face goes, and Fill hole closes it", async () => {
    useEditStore.getState().setSelectMode("face");
    const before = (await mesh()).indices.length / 3;
    useEditStore.getState().setSelected(await sideSelection(0));
    expect(await deleteSelectedPoints()).toBe(true);
    expect((await mesh()).indices.length / 3).toBe(before - 2);
    expect(get().history.past.at(-1)?.label).toBe("Delete faces");
    // the hole has one ring of four edges; with nothing selected the only hole is filled
    expect(await fillSelectedHole()).toBe(true);
    expect((await mesh()).indices.length / 3).toBeGreaterThan(before - 2);
  });
});

describe("divide faces", () => {
  const triangleTotal = async () => (await mesh()).indices.length / 3;

  it("pressing Divide cuts nothing and adds no undo step: only the panel opens", async () => {
    const steps = get().history.past.length;
    expect(await divideSelectedFaces()).toBe(true);
    expect(await triangleTotal()).toBe(12);
    expect(get().history.past.length).toBe(steps);
    expect(useEditStore.getState().divide!.cuts).toBe(0);
  });

  it("moving the slider divides the whole cube (12 triangles become 48) as ONE undo step, however often it moves", async () => {
    const steps = get().history.past.length;
    await divideSelectedFaces();
    expect(await changeDivide(1)).toBe(true);
    expect(await triangleTotal()).toBe(48);
    expect(get().history.past.length).toBe(steps + 1);
    expect(get().history.past.at(-1)?.label).toBe("Divide");
    expect(await changeDivide(2)).toBe(true);
    expect(await triangleTotal()).toBe(6 * 18);
    expect(get().history.past.length).toBe(steps + 1);
    get().undo();
    expect(await triangleTotal()).toBe(12);
  });

  it("dragging only previews; letting go stores once", async () => {
    await divideSelectedFaces();
    const asset = node("a").assetId;
    for (const cuts of [1, 2, 3]) expect(previewDivide(cuts)).toBe(true);
    expect(node("a").assetId).toBe(asset);
    expect(await commitDivide()).toBe(true);
    expect(node("a").assetId).not.toBe(asset);
  });

  it("dragging back to 0 before letting go stores nothing", async () => {
    await divideSelectedFaces();
    const steps = get().history.past.length;
    previewDivide(2);
    previewDivide(0);
    expect(await commitDivide()).toBe(true);
    expect(get().history.past.length).toBe(steps);
    expect(await triangleTotal()).toBe(12);
  });

  it("going back to 0 after cutting brings the mesh back as it was", async () => {
    await divideSelectedFaces();
    await changeDivide(2);
    expect(await changeDivide(0)).toBe(true);
    expect(await triangleTotal()).toBe(12);
  });

  it("is refused, saying why, once something else was done", async () => {
    await divideSelectedFaces();
    get().addPrimitive("cone");
    expect(await changeDivide(2)).toBe(false);
    expect(message()).toContain("right after dividing");
  });
});

describe("UVs of an edited mesh", () => {
  it("a cube made into a mesh keeps the UVs of the built-in cube", async () => {
    const m = await mesh();
    expect(m.uvs?.length).toBe((m.positions.length / 3) * 2);
  });

  it("moving points keeps the map: the surface moved, the UVs did not", async () => {
    const before = await mesh();
    const moved = Float32Array.from(before.positions, (v, i) =>
      i % 3 === 0 ? v + 1 : v,
    );
    expect(await commitMeshPositions("a", moved, "Move points")).toBe(true);
    const after = await mesh();
    expect(Array.from(after.uvs ?? [])).toEqual(Array.from(before.uvs ?? []));
  });

  it("a tool that does not know UVs removes them and says so, once", async () => {
    expect(await divideSelectedFaces()).toBe(true);
    expect(await changeDivide(1)).toBe(true);
    expect((await mesh()).uvs).toBeUndefined();
    expect(message()).toContain("removed the UV map");
    expect(message()).toContain("Divide");
    // the next change has no map left to lose, so nothing more is said
    useImportStore.setState({ message: null });
    expect(await changeDivide(2)).toBe(true);
    expect(message()).toBe("");
  });
});

describe("seams", () => {
  async function selectAnEdge() {
    const t = buildTopology(await mesh());
    const [a, b] = [t.vertexPoints[t.edges[0]!]!, t.vertexPoints[t.edges[1]!]!];
    useEditStore.getState().setSelected([...a, ...b]);
  }

  it("marks the selected edge: stored with the mesh, one undo step, the UV map kept, and Undo takes it away", async () => {
    await selectAnEdge();
    const steps = get().history.past.length;
    expect(await seamSelectedEdges(true)).toBe(true);
    expect(get().history.past.length).toBe(steps + 1);
    expect(get().history.past.at(-1)?.label).toBe("Mark seam");
    const m = await mesh();
    expect(m.seams).toHaveLength(1);
    expect(m.uvs).toBeDefined();
    get().undo();
    expect((await mesh()).seams).toBeUndefined();
  });

  it("clears it again, and marking the same edge twice adds no undo step", async () => {
    await selectAnEdge();
    await seamSelectedEdges(true);
    const steps = get().history.past.length;
    expect(await seamSelectedEdges(true)).toBe(true);
    expect(get().history.past.length).toBe(steps);
    expect(await seamSelectedEdges(false)).toBe(true);
    expect((await mesh()).seams).toBeUndefined();
    expect(get().history.past.at(-1)?.label).toBe("Clear seam");
  });

  it("asks for an edge when nothing is selected", async () => {
    expect(await seamSelectedEdges(true)).toBe(false);
    expect(message()).toContain("Select an edge");
  });
});
