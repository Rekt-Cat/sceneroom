import { beforeEach, describe, expect, it } from "vitest";
import { act, useState, type ReactNode } from "react";
import { _roots, createRoot, extend } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import {
  addNode,
  createEmptyScene,
  createModifier,
  createNode,
  type Modifier,
} from "@sceneroom/shared";
import { MemoryAssetStorage, setAssetStorage } from "@/assets/assetStorage";
import { clearMeshCache, storeMesh } from "@/assets/meshStorage";
import { bakeNodeToMesh } from "@/mesh/bakeMesh";
import { useSceneStore } from "@/store/sceneStore";
import { buildEditOverlay } from "@/meshEdit/editOverlay";
import { PLACEHOLDER_FLAG } from "./MeshEditor";
import SceneNodes, { MeshGeometry, ShapeGeometry } from "./SceneNodes";
import { buildShapeGeometry, geometryToMesh } from "./shapeGeometry";

/**
 * These mount the real components in React Three Fiber with a stand-in for the WebGL renderer (Node has
 * none), and check that every mesh always has a geometry a renderer and the selection outline can use.
 * They exist because selecting an object and pressing Apply once crashed the whole 3D view: the outline
 * (drei's Outlines) cannot cope with a geometry that has no points, and a mesh has none for a moment
 * while its data is being read.
 */
extend(THREE as never);
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function stubCanvas() {
  return {
    style: {},
    width: 100,
    height: 100,
    clientWidth: 100,
    clientHeight: 100,
    addEventListener() {},
    removeEventListener() {},
    getContext: () => null,
    getRootNode: () => ({}),
    ownerDocument: {},
    setPointerCapture() {},
    releasePointerCapture() {},
  } as unknown as HTMLCanvasElement;
}

/** The parts of a WebGL renderer that React Three Fiber and the outline touch. */
function stubRenderer() {
  return {
    domElement: stubCanvas(),
    shadowMap: {},
    xr: { enabled: false, addEventListener() {}, removeEventListener() {} },
    render() {},
    setSize() {},
    setPixelRatio() {},
    setClearColor() {},
    getPixelRatio: () => 1,
    getSize: (v: THREE.Vector2) => v.set(100, 100),
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(100, 100),
    dispose() {},
    forceContextLoss() {},
    info: {},
    capabilities: {},
    getContext: () => ({}),
  };
}

async function mount(children: ReactNode): Promise<THREE.Scene> {
  const canvas = stubCanvas();
  const root = createRoot(canvas);
  await act(async () => {
    root.configure({
      gl: (() => stubRenderer()) as never,
      size: { width: 100, height: 100, top: 0, left: 0 },
      frameloop: "never",
      events: undefined,
      dpr: 1,
    } as never);
    root.render(children);
  });
  return _roots.get(canvas)!.store.getState().scene;
}

/** What a renderer, a raycast or the outline would trip over: a mesh without a proper geometry or without points. */
function problems(scene: THREE.Scene): string[] {
  const found: string[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry as THREE.BufferGeometry | undefined;
    const name = object.name || "a mesh";
    if (!(geometry instanceof THREE.BufferGeometry)) {
      found.push(`${name}: its geometry is ${String(geometry)}`);
    } else if (geometry.index === undefined) {
      found.push(`${name}: geometry.index is undefined`);
    } else if (!geometry.getAttribute("position")) {
      found.push(`${name}: its geometry has no points`);
    }
  });
  return found;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

beforeEach(() => {
  setAssetStorage(new MemoryAssetStorage());
  clearMeshCache();
});

describe("a selected object (with its outline) that becomes a mesh", () => {
  const bent = [{ ...createModifier("m", "bend"), angle: 80 } as Modifier];

  it("keeps a valid geometry with points, before, during and after the mesh data is read", async () => {
    const { id } = await storeMesh(
      geometryToMesh(buildShapeGeometry("cube", 6, bent)),
    );
    let flip!: () => void;
    function Probe() {
      const [asMesh, setAsMesh] = useState(false);
      flip = () => setAsMesh(true);
      return (
        <mesh name="trunk">
          {asMesh ? (
            <MeshGeometry assetId={id} modifiers={[]} />
          ) : (
            <ShapeGeometry kind="cube" segments={6} modifiers={bent} />
          )}
          <meshStandardMaterial />
          <Outlines color="#ffb020" thickness={0.05} />
        </mesh>
      );
    }
    const scene = await mount(<Probe />);
    expect(problems(scene)).toEqual([]);
    const geometry = () =>
      (scene.getObjectByName("trunk") as THREE.Mesh)
        .geometry as THREE.BufferGeometry;
    const before = geometry().getAttribute("position").count;

    // the moment of the swap: the data is not read yet
    await act(async () => {
      flip();
    });
    expect(problems(scene)).toEqual([]);
    await settle();
    expect(problems(scene)).toEqual([]);
    expect(geometry().getAttribute("position").count).toBe(before);
  });

  it("an object that starts as a mesh (a reload with it selected) shows the placeholder, then the mesh", async () => {
    const { id } = await storeMesh(
      geometryToMesh(buildShapeGeometry("cube", 2, [])),
    );
    clearMeshCache(); // as after a reload: the data must come from storage
    const scene = await mount(
      <mesh name="trunk">
        <MeshGeometry assetId={id} modifiers={[]} />
        <meshStandardMaterial />
        <Outlines color="#ffb020" thickness={0.05} />
      </mesh>,
    );
    expect(problems(scene)).toEqual([]);
    await settle();
    expect(problems(scene)).toEqual([]);
    const geometry = (scene.getObjectByName("trunk") as THREE.Mesh)
      .geometry as THREE.BufferGeometry;
    expect(geometry.getAttribute("position").count).toBe(
      buildShapeGeometry("cube", 2, []).getAttribute("position").count,
    );
  });

  it("a mesh whose data is missing shows a plain box instead of failing", async () => {
    const scene = await mount(
      <mesh name="lost">
        <MeshGeometry assetId="no-such-mesh" modifiers={[]} />
        <meshStandardMaterial />
        <Outlines color="#ffb020" thickness={0.05} />
      </mesh>,
    );
    await settle();
    expect(problems(scene)).toEqual([]);
    expect(
      (scene.getObjectByName("lost") as THREE.Mesh).geometry,
    ).toBeInstanceOf(THREE.BoxGeometry);
  });

  it("an object with no mesh id at all still has a valid geometry", async () => {
    const scene = await mount(
      <mesh name="empty">
        <MeshGeometry assetId={null} modifiers={[]} />
        <meshStandardMaterial />
        <Outlines color="#ffb020" thickness={0.05} />
      </mesh>,
    );
    expect(problems(scene)).toEqual([]);
  });
});

describe("the real scene tree", () => {
  it("keeps every geometry valid through Apply modifiers", async () => {
    useSceneStore.getState().loadScene(
      addNode(createEmptyScene(), {
        ...createNode("trunk", "cube"),
        name: "Trunk",
        segments: 6,
        modifiers: [{ ...createModifier("m", "bend"), angle: 80 } as Modifier],
      }),
    );
    const scene = await mount(<SceneNodes />);
    expect(problems(scene)).toEqual([]);
    await act(async () => {
      await bakeNodeToMesh("trunk");
    });
    await settle();
    expect(useSceneStore.getState().scene.nodes["trunk"]?.kind).toBe("mesh");
    expect(problems(scene)).toEqual([]);
    // what the pointer code and the selection box would do with it
    expect(new THREE.Box3().setFromObject(scene).isEmpty()).toBe(false);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(0, 0, -1),
    );
    expect(() => ray.intersectObject(scene, true)).not.toThrow();
  });
});

describe("editing the points of a mesh", () => {
  it("the placeholder is flagged, so edit mode never mistakes it for the real mesh", async () => {
    // a storage that never answers, so the mesh stays "loading"
    setAssetStorage({
      put: async () => undefined,
      has: async () => false,
      get: () => new Promise(() => undefined),
    });
    const scene = await mount(
      <mesh name="loading">
        <MeshGeometry assetId="not-stored-yet" modifiers={[]} />
        <meshStandardMaterial />
      </mesh>,
    );
    const geometry = (scene.getObjectByName("loading") as THREE.Mesh)
      .geometry as THREE.BufferGeometry;
    expect(geometry.userData[PLACEHOLDER_FLAG]).toBe(true);
  });

  it("a newly stored version is shown at once, with no empty moment, and the overlay can be put on it again", async () => {
    const first = geometryToMesh(buildShapeGeometry("cube", 2, []));
    const { id: before } = await storeMesh(first);
    const moved = {
      positions: new Float32Array(first.positions),
      indices: first.indices,
    };
    moved.positions[0] += 3;
    const { id: after } = await storeMesh(moved);

    let flip!: () => void;
    function Probe() {
      const [id, setId] = useState(before);
      flip = () => setId(after);
      return (
        <mesh name="block">
          <MeshGeometry assetId={id} modifiers={[]} />
          <meshStandardMaterial />
          <Outlines color="#ffb020" thickness={0.05} />
        </mesh>
      );
    }
    const scene = await mount(<Probe />);
    const block = () => scene.getObjectByName("block") as THREE.Mesh;
    const geometry = () => block().geometry as THREE.BufferGeometry;

    const overlay = buildEditOverlay(geometry());
    block().add(overlay.group);
    expect(block().children).toContain(overlay.group);
    const oldGeometry = geometry();

    // no waiting: the version is in memory, so the very next render already has it
    await act(async () => {
      flip();
    });
    expect(problems(scene)).toEqual([]);
    expect(geometry()).not.toBe(oldGeometry);
    expect(geometry().userData[PLACEHOLDER_FLAG]).toBeUndefined();
    expect(geometry().getAttribute("position").getX(0)).toBeCloseTo(
      first.positions[0]! + 3,
    );

    // the overlay is rebuilt on the new geometry (what MeshEditor does when it notices the change)
    overlay.dispose();
    const next = buildEditOverlay(geometry());
    block().add(next.group);
    expect(next.group.children).toHaveLength(2);
    expect(problems(scene)).toEqual([]);
  });
});

describe("plants in the 3D view", () => {
  it("a selected plant (with its outline) keeps valid geometry through a change of seed, a kind, and no leaves", async () => {
    const { default: PlantObject } = await import("./PlantObject");
    const { DEFAULT_PLANT } = await import("@sceneroom/shared");
    const material = createNode("m", "cube").material;
    let change!: (settings: typeof DEFAULT_PLANT) => void;
    function Probe() {
      const [settings, setSettings] = useState(DEFAULT_PLANT);
      change = setSettings;
      return (
        <group name="plant">
          <PlantObject
            plant={settings}
            color="#7a5230"
            material={material}
            selected
            cut={false}
          />
        </group>
      );
    }
    const scene = await mount(<Probe />);
    const parts = () =>
      scene
        .getObjectByName("plant")!
        .children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    expect(parts()).toHaveLength(2); // wood and leaves
    expect(problems(scene)).toEqual([]);

    await act(async () => change({ ...DEFAULT_PLANT, seed: 99 }));
    expect(problems(scene)).toEqual([]);
    await act(async () =>
      change({ ...DEFAULT_PLANT, height: 8, levels: 3, sides: 12, rings: 8 }),
    );
    expect(problems(scene)).toEqual([]);
    // no leaves: only the wood is drawn
    await act(async () => change({ ...DEFAULT_PLANT, leafDensity: 0 }));
    expect(parts()).toHaveLength(1);
    expect(problems(scene)).toEqual([]);
    // and back again
    await act(async () => change({ ...DEFAULT_PLANT, leafDensity: 1 }));
    expect(parts()).toHaveLength(2);
    expect(problems(scene)).toEqual([]);
  });

  it("the real scene tree draws plants, and a forest of them", async () => {
    useSceneStore.getState().loadScene(createEmptyScene());
    const id = useSceneStore.getState().addPlant("tree");
    useSceneStore.getState().scatterPlant(id, [
      { x: 3, z: 0, turn: 0, size: 1, seed: 5 },
      { x: -3, z: 0, turn: 1, size: 1.2, seed: 6 },
    ]);
    // nothing selected: the move handle needs a real browser
    useSceneStore.getState().select(null);
    const scene = await mount(<SceneNodes />);
    expect(problems(scene)).toEqual([]);
    let meshes = 0;
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes += 1;
    });
    expect(meshes).toBe(6); // three plants, wood and leaves each
    // the pointer code can work with them
    expect(new THREE.Box3().setFromObject(scene).isEmpty()).toBe(false);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 2, 10),
      new THREE.Vector3(0, 0, -1),
    );
    expect(() => ray.intersectObject(scene, true)).not.toThrow();
  });
});
