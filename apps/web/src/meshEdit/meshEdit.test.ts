import { beforeEach, describe, expect, it } from "vitest";
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  PerspectiveCamera,
  Object3D,
} from "three";
import { addNode, createEmptyScene, createNode } from "@sceneroom/shared";
import { MemoryAssetStorage, setAssetStorage } from "@/assets/assetStorage";
import {
  clearMeshCache,
  loadMeshData,
  peekMeshData,
} from "@/assets/meshStorage";
import { bakeNodeToMesh } from "@/mesh/bakeMesh";
import { buildMeshGeometry } from "@/components/viewport/shapeGeometry";
import { useEditStore } from "@/store/editStore";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { commitMeshPositions } from "./commitMeshEdit";
import { buildEditOverlay } from "./editOverlay";
import { copyPositions, moveSelectedLive } from "./liveEdit";
import { projectPoints } from "./projectPoints";
import {
  startEditing,
  stopEditing,
  toggleEditMode,
  watchEditMode,
} from "./startEditing";

const get = () => useSceneStore.getState();
const node = (id: string) => get().scene.nodes[id]!;
const message = () => useImportStore.getState().message?.text ?? "";

/** A mesh made of a cube cut up a little. */
function sceneWithCube() {
  get().loadScene(
    addNode(createEmptyScene(), {
      ...createNode("a", "cube"),
      name: "Block",
      segments: 2,
    }),
  );
  get().select("a");
}

beforeEach(() => {
  setAssetStorage(new MemoryAssetStorage());
  clearMeshCache();
  useEditStore.getState().exit();
  useImportStore.setState({ busy: false, message: null });
  sceneWithCube();
});

describe("starting and leaving edit mode", () => {
  it("turns a shape into a mesh first, then starts editing it", async () => {
    expect(await startEditing("a")).toBe(true);
    expect(node("a").kind).toBe("mesh");
    expect(useEditStore.getState().nodeId).toBe("a");
    expect(useEditStore.getState().selected).toEqual([]);
  });

  it("a mesh starts editing directly, without making another version", async () => {
    await bakeNodeToMesh("a");
    const before = node("a").assetId;
    expect(await startEditing("a")).toBe(true);
    expect(node("a").assetId).toBe(before);
  });

  it("selects the object if something else was selected", async () => {
    get().select(null);
    await startEditing("a");
    expect(get().selectedIds).toEqual(["a"]);
  });

  it("refuses a mesh that has modifiers on it, saying to bake them first", async () => {
    await bakeNodeToMesh("a");
    get().addModifier("a", "bend");
    expect(await startEditing("a")).toBe(false);
    expect(useEditStore.getState().nodeId).toBeNull();
    expect(message()).toContain("Make mesh");
  });

  it("a switched-off modifier does not stop editing", async () => {
    await bakeNodeToMesh("a");
    get().addModifier("a", "bend");
    get().setModifier("a", node("a").modifiers[0]!.id, { enabled: false });
    expect(await startEditing("a")).toBe(true);
  });

  it("refuses a locked object, a light, and an object that does not exist", async () => {
    get().setNodesLocked(["a"], true);
    expect(await startEditing("a")).toBe(false);
    expect(message()).toContain("locked");
    const light = get().addLight("point");
    expect(await startEditing(light)).toBe(false);
    expect(await startEditing("nope")).toBe(false);
    expect(useEditStore.getState().nodeId).toBeNull();
  });

  it("Tab enters edit mode for the one selected object and leaves again", async () => {
    await toggleEditMode();
    expect(useEditStore.getState().nodeId).toBe("a");
    await toggleEditMode();
    expect(useEditStore.getState().nodeId).toBeNull();
  });

  it("Tab with nothing or several selected says what to do", async () => {
    get().select(null);
    await toggleEditMode();
    expect(message()).toContain("Select one");
    expect(useEditStore.getState().nodeId).toBeNull();
  });

  it("stopEditing clears the point selection too", async () => {
    await startEditing("a");
    useEditStore.getState().setSelected([1, 2]);
    stopEditing();
    expect(useEditStore.getState()).toMatchObject({
      nodeId: null,
      selected: [],
    });
  });
});

describe("edit mode ends by itself", () => {
  it("when the selection moves to another object, or is cleared, or the object goes away", async () => {
    const stop = watchEditMode();
    try {
      get().loadScene(
        addNode(
          addNode(createEmptyScene(), createNode("a", "cube")),
          createNode("b", "sphere"),
        ),
      );
      get().select("a");
      await startEditing("a");
      get().select("b");
      expect(useEditStore.getState().nodeId).toBeNull();

      get().select("a");
      await startEditing("a");
      get().select(null);
      expect(useEditStore.getState().nodeId).toBeNull();

      get().select("a");
      await startEditing("a");
      get().deleteSelected();
      expect(useEditStore.getState().nodeId).toBeNull();
    } finally {
      stop();
    }
  });

  it("when Undo turns the mesh back into a shape", async () => {
    const stop = watchEditMode();
    try {
      await startEditing("a");
      expect(useEditStore.getState().nodeId).toBe("a");
      get().undo(); // undoes "Convert to mesh"
      expect(node("a").kind).toBe("cube");
      expect(useEditStore.getState().nodeId).toBeNull();
    } finally {
      stop();
    }
  });

  it("but not for changes that keep the same object selected (an edit and its Undo)", async () => {
    const stop = watchEditMode();
    try {
      await startEditing("a");
      const positions = copyMesh();
      positions[0] += 0.25;
      await commitMeshPositions("a", positions, "Move point");
      expect(useEditStore.getState().nodeId).toBe("a");
      get().undo();
      expect(useEditStore.getState().nodeId).toBe("a");
    } finally {
      stop();
    }
  });
});

/** The points of the edited mesh, copied. */
function copyMesh(): Float32Array {
  const mesh = peekMeshData(node("a").assetId!)!;
  return new Float32Array(mesh.positions);
}

describe("storing an edit", () => {
  beforeEach(async () => {
    await bakeNodeToMesh("a");
  });

  it("makes a new version with the moved points and the same triangles, as one undo step", async () => {
    const before = node("a").assetId!;
    const original = copyMesh();
    const moved = new Float32Array(original);
    moved[3] += 1; // point 1, x
    expect(await commitMeshPositions("a", moved, "Move point")).toBe(true);

    const after = node("a").assetId!;
    expect(after).not.toBe(before);
    const stored = await loadMeshData(after);
    expect(stored.positions[3]).toBeCloseTo(original[3]! + 1);
    expect(Array.from(stored.indices)).toEqual(
      Array.from((await loadMeshData(before)).indices),
    );
    expect(get().history.past.at(-1)?.label).toBe("Move point");
  });

  it("Undo brings back the old points and Redo the new ones", async () => {
    const before = node("a").assetId!;
    const moved = copyMesh();
    moved[0] += 2;
    await commitMeshPositions("a", moved, "Move point");
    const after = node("a").assetId!;
    get().undo();
    expect(node("a").assetId).toBe(before);
    get().redo();
    expect(node("a").assetId).toBe(after);
    // both versions are in memory, so either is shown in the same frame
    expect(peekMeshData(before)).toBeDefined();
    expect(peekMeshData(after)).toBeDefined();
  });

  it("keeps the name and the notes of the mesh", async () => {
    const note = get().scene.assets[node("a").assetId!]!.note;
    const moved = copyMesh();
    moved[0] += 1;
    await commitMeshPositions("a", moved, "Move point");
    const info = get().scene.assets[node("a").assetId!]!;
    expect(info.name).toBe("Block");
    expect(info.note).toBe(note);
  });

  it("storing the same points again makes no undo step", async () => {
    const steps = get().history.past.length;
    expect(await commitMeshPositions("a", copyMesh(), "Move point")).toBe(true);
    expect(get().history.past).toHaveLength(steps);
  });

  it("does nothing for a locked object, a shape, or a point list that is not valid", async () => {
    const steps = get().history.past.length;
    const moved = copyMesh();
    moved[0] += 1;
    get().setNodesLocked(["a"], true);
    await commitMeshPositions("a", moved, "Move point");
    expect(get().history.past).toHaveLength(steps + 1); // only the lock itself
    get().setNodesLocked(["a"], false);

    expect(await commitMeshPositions("nope", moved, "Move point")).toBe(false);

    const broken = new Float32Array(moved);
    broken[0] = NaN;
    expect(await commitMeshPositions("a", broken, "Move point")).toBe(false);
    expect(message()).toContain("Could not store");
  });

  it("a light is not a mesh", async () => {
    const light = get().addLight("spot");
    expect(await commitMeshPositions(light, new Float32Array(9), "x")).toBe(
      false,
    );
  });
});

describe("the overlay of points and lines", () => {
  /** A square of two triangles. */
  function square(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    return geometry;
  }

  it("shares the point list with the mesh, so moving a point on the mesh moves it in the overlay", () => {
    const geometry = square();
    const overlay = buildEditOverlay(geometry);
    const [lines, points] = overlay.group.children as unknown as [
      { geometry: BufferGeometry },
      { geometry: BufferGeometry },
    ];
    const shared = geometry.getAttribute("position");
    expect(lines.geometry.getAttribute("position")).toBe(shared);
    expect(points.geometry.getAttribute("position")).toBe(shared);
    // 5 edges for two triangles that share one
    expect(lines.geometry.index!.count / 2).toBe(5);
  });

  it("colours the selected points, and ignores numbers that are not points", () => {
    const overlay = buildEditOverlay(square());
    const colors = () => {
      const points = overlay.group.children[1] as unknown as {
        geometry: BufferGeometry;
      };
      return Array.from(points.geometry.getAttribute("color").array);
    };
    const plain = colors();
    overlay.setSelected([2, 99, -1]);
    const after = colors();
    expect(after.slice(6, 9)).not.toEqual(plain.slice(6, 9)); // point 2 changed
    expect(after.slice(0, 6)).toEqual(plain.slice(0, 6)); // the others did not
    overlay.setSelected([]);
    expect(colors()).toEqual(plain);
  });

  it("takes no clicks and is not hit by the pointer", () => {
    const overlay = buildEditOverlay(square());
    for (const child of overlay.group.children) {
      const hits: unknown[] = [];
      child.raycast({} as never, hits as never);
      expect(hits).toEqual([]);
    }
  });

  it("is removed from the mesh and freed when disposed", () => {
    const parent = new Object3D();
    const overlay = buildEditOverlay(square());
    parent.add(overlay.group);
    overlay.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it("works for a geometry with no index", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    const overlay = buildEditOverlay(geometry);
    expect(
      (overlay.group.children[0] as unknown as { geometry: BufferGeometry })
        .geometry.index!.count,
    ).toBe(6);
  });
});

describe("where points are on the screen", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  const camera = () => {
    const c = new PerspectiveCamera(90, 2, 0.1, 100);
    c.position.set(0, 0, 5);
    c.updateMatrixWorld();
    return c;
  };

  it("the middle of the view is the middle of the rectangle", () => {
    const projected = projectPoints(new Object3D(), camera(), rect, [0, 0, 0]);
    expect(projected[0]).toBeCloseTo(200);
    expect(projected[1]).toBeCloseTo(100);
  });

  it("up on the screen is smaller y, right is larger x", () => {
    const projected = projectPoints(
      new Object3D(),
      camera(),
      rect,
      [1, 1, 0, 0, 0, 0],
    );
    expect(projected[0]).toBeGreaterThan(projected[2]!);
    expect(projected[1]).toBeLessThan(projected[3]!);
  });

  it("follows the object's own position, turn and scale", () => {
    const object = new Object3D();
    object.position.set(1, 0, 0);
    const moved = projectPoints(object, camera(), rect, [0, 0, 0]);
    const plain = projectPoints(new Object3D(), camera(), rect, [1, 0, 0]);
    expect(moved[0]).toBeCloseTo(plain[0]!);
    const scaled = new Object3D();
    scaled.scale.set(2, 2, 2);
    expect(projectPoints(scaled, camera(), rect, [1, 0, 0])[0]).toBeCloseTo(
      projectPoints(new Object3D(), camera(), rect, [2, 0, 0])[0]!,
    );
  });

  it("a point behind the camera has no place on the screen", () => {
    const projected = projectPoints(new Object3D(), camera(), rect, [0, 0, 10]);
    expect(Number.isNaN(projected[0])).toBe(true);
    expect(Number.isNaN(projected[1])).toBe(true);
  });
});

describe("moving points while dragging", () => {
  function mesh() {
    return buildMeshGeometry(
      {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      },
      [],
    );
  }

  it("moves the selected points from where they began, and nothing else", () => {
    const geometry = mesh();
    const start = copyPositions(geometry);
    moveSelectedLive(geometry, start, [2], [0, 0, 3]);
    const moved = copyPositions(geometry);
    expect(Array.from(moved.slice(6, 9))).toEqual([1, 1, 3]);
    expect(Array.from(moved.slice(0, 6))).toEqual(
      Array.from(start.slice(0, 6)),
    );
  });

  it("dragging back and forth does not add up", () => {
    const geometry = mesh();
    const start = copyPositions(geometry);
    moveSelectedLive(geometry, start, [0], [5, 0, 0]);
    moveSelectedLive(geometry, start, [0], [1, 0, 0]);
    expect(copyPositions(geometry)[0]).toBe(1);
  });

  it("refreshes the shading and the bounds so clicking matches what is drawn", () => {
    const geometry = mesh();
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.z).toBe(0);
    moveSelectedLive(geometry, copyPositions(geometry), [2], [0, 0, 4]);
    expect(geometry.boundingBox!.max.z).toBe(4);
    expect(geometry.boundingSphere!.radius).toBeGreaterThan(1);
    // a flat square has a normal along z; once a corner is lifted the normal of the first corner tilts
    expect(geometry.getAttribute("normal").getZ(0)).toBeLessThan(1);
    // the points were marked as changed, so the graphics card gets the new ones
    expect(
      (geometry.getAttribute("position") as BufferAttribute).version,
    ).toBeGreaterThan(0);
  });
});
