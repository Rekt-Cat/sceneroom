import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import {
  addAsset,
  addNode,
  createEmptyScene,
  createLightNode,
  createModelNode,
  createModifier,
  createNode,
  createPlantNode,
  setPlant as setPlantInScene,
  type AssetInfo,
  type Modifier,
  type Scene,
  type SceneNode,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { buildExportScene, disposeExportScene } from "./buildExportScene";
import { buildGlb, glbFileName, sceneToGlb } from "./exportGlb";

/** The exporter reads its buffers with a browser's FileReader; Node has none, so this stands in for it. */
beforeAll(() => {
  class TestFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      });
    }
  }
  (globalThis as unknown as { FileReader: unknown }).FileReader =
    TestFileReader;
});

type Gltf = {
  asset: { version: string };
  scene: number;
  scenes: { nodes: number[] }[];
  nodes: {
    name?: string;
    mesh?: number;
    children?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    extensions?: { KHR_lights_punctual?: { light: number } };
  }[];
  meshes: {
    primitives: { attributes: Record<string, number>; indices?: number }[];
  }[];
  materials: Record<string, unknown>[];
  accessors: { count: number; min?: number[]; max?: number[] }[];
  extensions?: {
    KHR_lights_punctual?: {
      lights: {
        type: string;
        intensity: number;
        range?: number;
        spot?: { outerConeAngle: number };
      }[];
    };
  };
};

/** Reads the JSON part of a .glb file (header, then the JSON chunk). */
function readGlb(bytes: ArrayBuffer): Gltf {
  const view = new DataView(bytes);
  expect(view.getUint32(0, true)).toBe(0x46546c67); // "glTF"
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a); // "JSON"
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)),
  ) as Gltf;
}

const named = (gltf: Gltf, name: string) =>
  gltf.nodes.find((node) => node.name === name);

const withModifier = (node: SceneNode, modifier: Modifier): SceneNode => ({
  ...node,
  modifiers: [...node.modifiers, modifier],
});

function sampleScene(): Scene {
  let scene = createEmptyScene();
  scene = addNode(scene, { ...createNode("cube", "cube"), name: "Cube" });
  scene = addNode(scene, {
    ...withModifier(createNode("bent", "cube"), {
      ...createModifier("m", "bend"),
      angle: 90,
    } as Modifier),
    name: "Bent",
    segments: 6,
  });
  scene = addNode(scene, {
    ...createNode("glass", "sphere"),
    name: "Glass",
    color: "#ff8800",
    material: {
      ...createNode("x", "sphere").material,
      opacity: 0.5,
      emissiveColor: "#00ff00",
      emissiveIntensity: 2,
      roughness: 0.2,
      metalness: 0.9,
    },
  });
  scene = addNode(scene, { ...createNode("sheet", "plane"), name: "Sheet" });
  scene = addNode(scene, {
    ...createNode("ball", "sphere"),
    name: "Faceted",
    material: { ...createNode("x", "sphere").material, flatShading: true },
  });
  scene = addNode(scene, {
    ...createNode("child", "cone"),
    name: "Child",
    parentId: "cube",
    transform: {
      position: [0, 2, 0],
      rotation: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
    },
  });
  scene = addNode(scene, {
    ...createNode("hid", "cube"),
    name: "Hidden",
    visible: false,
  });
  for (const kind of ["directional", "point", "spot"] as const) {
    scene = addNode(scene, createLightNode(kind, kind));
  }
  return scene;
}

async function exportOf(scene: Scene) {
  const { root, report } = buildExportScene(scene, () => undefined);
  try {
    return { gltf: readGlb(await sceneToGlb(root)), report };
  } finally {
    disposeExportScene(root);
  }
}

describe("exporting the scene as a GLB", () => {
  it("writes a valid GLB with the objects, in their hierarchy and with their transforms", async () => {
    const { gltf, report } = await exportOf(sampleScene());
    expect(gltf.asset.version).toBe("2.0");
    const cube = named(gltf, "Cube")!;
    const child = named(gltf, "Child")!;
    expect(cube.children).toContain(gltf.nodes.indexOf(child));
    expect(child.translation).toEqual([0, 2, 0]);
    // a quarter turn about y is the quaternion (0, sin 45, 0, cos 45)
    expect(child.rotation![1]).toBeCloseTo(Math.SQRT1_2);
    expect(child.rotation![3]).toBeCloseTo(Math.SQRT1_2);
    expect(report).toMatchObject({ lights: 3, models: 0, hidden: 1 });
  });

  it("leaves out hidden objects", async () => {
    const { gltf } = await exportOf(sampleScene());
    expect(named(gltf, "Hidden")).toBeUndefined();
  });

  it("writes the material: colour, roughness, metalness, glow, see-through and both sides", async () => {
    const { gltf } = await exportOf(sampleScene());
    const materialOf = (name: string) => {
      const mesh = gltf.meshes[named(gltf, name)!.mesh!]!;
      const index = (mesh.primitives[0] as unknown as { material: number })
        .material;
      return gltf.materials[index] as {
        pbrMetallicRoughness: {
          baseColorFactor: number[];
          roughnessFactor: number;
          metallicFactor: number;
        };
        emissiveFactor?: number[];
        alphaMode?: string;
        doubleSided?: boolean;
        extensions?: {
          KHR_materials_emissive_strength?: { emissiveStrength: number };
        };
      };
    };
    const glassMaterial = materialOf("Glass");
    expect(glassMaterial.pbrMetallicRoughness.roughnessFactor).toBeCloseTo(0.2);
    expect(glassMaterial.pbrMetallicRoughness.metallicFactor).toBeCloseTo(0.9);
    expect(glassMaterial.pbrMetallicRoughness.baseColorFactor[3]).toBeCloseTo(
      0.5,
    );
    expect(glassMaterial.alphaMode).toBe("BLEND");
    expect(glassMaterial.emissiveFactor![1]).toBeGreaterThan(0.9);
    expect(
      glassMaterial.extensions?.KHR_materials_emissive_strength
        ?.emissiveStrength,
    ).toBe(2);
    // a plane has no thickness, so it is double-sided from the start
    expect(materialOf("Sheet").doubleSided).toBe(true);
    expect(materialOf("Cube").doubleSided).toBeUndefined();
    expect(materialOf("Cube").alphaMode).toBeUndefined();
  });

  it("exports the shape with its modifiers applied", async () => {
    const { gltf } = await exportOf(sampleScene());
    const boundsOf = (name: string) => {
      const primitive = gltf.meshes[named(gltf, name)!.mesh!]!.primitives[0]!;
      const accessor = gltf.accessors[primitive.attributes["POSITION"]!]!;
      return { min: accessor.min!, max: accessor.max!, count: accessor.count };
    };
    const plain = boundsOf("Cube");
    const bent = boundsOf("Bent");
    // the plain cube is 1 across; the bent one has swung out past that and has many more points
    expect(plain.max[2]).toBeCloseTo(0.5);
    expect(bent.max[2]).toBeGreaterThan(plain.max[2]!);
    expect(bent.count).toBeGreaterThan(plain.count);
  });

  it("flat shading is written as faceted triangles (no shared points)", async () => {
    const { gltf } = await exportOf(sampleScene());
    const smooth = gltf.meshes[named(gltf, "Glass")!.mesh!]!.primitives[0]!;
    const flat = gltf.meshes[named(gltf, "Faceted")!.mesh!]!.primitives[0]!;
    expect(smooth.indices).toBeDefined();
    expect(flat.indices).toBeUndefined();
  });

  it("writes the three kinds of light with their settings, aimed along the object's front", async () => {
    const { gltf } = await exportOf(sampleScene());
    const lights = gltf.extensions!.KHR_lights_punctual!.lights;
    expect(lights.map((l) => l.type).sort()).toEqual([
      "directional",
      "point",
      "spot",
    ]);
    const spot = lights.find((l) => l.type === "spot")!;
    expect(spot.spot!.outerConeAngle).toBeCloseTo((40 * Math.PI) / 180);
    expect(spot.intensity).toBe(80);
    // each light sits on an object with its position and the rotation that aims it
    const node = named(gltf, "Spot light")!;
    expect(node.extensions?.KHR_lights_punctual).toBeDefined();
    expect(node.translation).toEqual([0, 4, 2]);
    expect(node.rotation).toBeDefined();
  });

  it("a model whose file cannot be loaded is left out and reported", async () => {
    const info: AssetInfo = {
      id: "nofile",
      name: "Car",
      type: "model",
      bytes: 1,
      triangles: 1,
      boundsMin: [0, 0, 0],
      boundsMax: [1, 1, 1],
      note: "",
    };
    let scene = addAsset(createEmptyScene(), info);
    scene = addNode(scene, createModelNode("m", "Car", "nofile", 1));
    scene = addNode(scene, { ...createNode("c", "cube"), name: "Cube" });
    useSceneStore.getState().loadScene(scene);
    const { bytes, report } = await buildGlb();
    expect(report.missingModels).toEqual(["Car"]);
    expect(report.models).toBe(0);
    expect(named(readGlb(bytes), "Cube")).toBeDefined();
  });

  it("a model that is available is exported inside its object, shifted so its bottom middle is the origin", () => {
    const info: AssetInfo = {
      id: "car",
      name: "Car",
      type: "model",
      bytes: 1,
      triangles: 12,
      boundsMin: [-1, 0.5, -1],
      boundsMax: [1, 2.5, 1],
      note: "",
    };
    let scene = addAsset(createEmptyScene(), info);
    scene = addNode(scene, createModelNode("m", "Car", "car", 0.5));
    const body = new Group();
    body.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial()));
    const { root, report } = buildExportScene(scene, () => body);
    expect(report.models).toBe(1);
    const object = root.children[0]!;
    expect(object.name).toBe("Car");
    expect(object.scale.x).toBe(0.5);
    // the model is moved down so its lowest point (y = 0.5) sits at the origin
    expect(object.children[0]!.position.y).toBeCloseTo(-0.5);
  });

  it("freeing the export scene does not free a model's own parts", () => {
    const geometry = new BoxGeometry(1, 1, 1);
    let disposed = false;
    geometry.addEventListener("dispose", () => (disposed = true));
    const root = new Group();
    root.add(new Mesh(geometry, new MeshStandardMaterial()));
    disposeExportScene(root);
    expect(disposed).toBe(false);
  });

  it("names the file after the date", () => {
    expect(glbFileName(new Date(2026, 10, 4))).toBe("scene-2026-11-04.glb");
  });
});

beforeEach(() => {
  useSceneStore.getState().loadScene(createEmptyScene());
});

describe("exporting an editable mesh", () => {
  it("a mesh is exported with the points it has, with its modifiers applied", async () => {
    const mesh = {
      positions: new Float32Array([0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    let scene = createEmptyScene();
    scene = addAsset(scene, {
      id: "m1",
      name: "Panel",
      type: "mesh",
      bytes: 1,
      triangles: 2,
      boundsMin: [0, 0, 0],
      boundsMax: [2, 3, 0],
      note: "",
    });
    scene = addNode(scene, {
      ...createNode("p", "cube"),
      kind: "mesh",
      assetId: "m1",
      name: "Panel",
    });
    const { root, report } = buildExportScene(
      scene,
      () => undefined,
      () => mesh,
    );
    const gltf = readGlb(await sceneToGlb(root));
    disposeExportScene(root);
    expect(report.objects).toBe(1);
    const primitive = gltf.meshes[named(gltf, "Panel")!.mesh!]!.primitives[0]!;
    const accessor = gltf.accessors[primitive.attributes["POSITION"]!]!;
    expect(accessor.max).toEqual([2, 3, 0]);
    expect(accessor.count).toBe(4);
  });

  it("a mesh whose data is not available is left out and reported", () => {
    let scene = createEmptyScene();
    scene = addNode(scene, {
      ...createNode("p", "cube"),
      kind: "mesh",
      assetId: "gone",
      name: "Panel",
    });
    const { root, report } = buildExportScene(
      scene,
      () => undefined,
      () => undefined,
    );
    expect(report.missingModels).toEqual(["Panel"]);
    expect(report.objects).toBe(0);
    disposeExportScene(root);
  });
});

describe("exporting a plant", () => {
  it("a plant is exported as two meshes, wood and leaves, each with its own colour", async () => {
    let scene = createEmptyScene();
    scene = addNode(scene, { ...createPlantNode("p", "tree", 9), name: "Oak" });
    const { gltf, report } = await exportOf(scene);
    expect(report.objects).toBe(1);
    const wood = named(gltf, "Oak wood")!;
    const leaves = named(gltf, "Oak leaves")!;
    expect(wood.mesh).toBeDefined();
    expect(leaves.mesh).toBeDefined();
    const colorOf = (node: { mesh?: number }) => {
      const primitive = gltf.meshes[node.mesh!]!.primitives[0] as unknown as {
        material: number;
      };
      return (
        gltf.materials[primitive.material] as {
          pbrMetallicRoughness: { baseColorFactor: number[] };
        }
      ).pbrMetallicRoughness.baseColorFactor;
    };
    // the leaves are greener than the wood
    expect(colorOf(leaves)[1]!).toBeGreaterThan(colorOf(wood)[1]!);
    expect(colorOf(wood)[0]!).toBeGreaterThan(colorOf(wood)[2]!);
  });

  it("a plant with no leaves is only wood, and a bigger plant has more points", async () => {
    let bare = createEmptyScene();
    bare = addNode(bare, { ...createPlantNode("p", "tree", 9), name: "Bare" });
    bare = setPlantInScene(bare, "p", { leafDensity: 0, levels: 0 });
    const { gltf } = await exportOf(bare);
    expect(named(gltf, "Bare wood")).toBeDefined();
    expect(named(gltf, "Bare leaves")).toBeUndefined();
    const small =
      gltf.accessors[
        gltf.meshes[named(gltf, "Bare wood")!.mesh!]!.primitives[0]!.attributes[
          "POSITION"
        ]!
      ]!.count;

    let big = createEmptyScene();
    big = addNode(big, { ...createPlantNode("p", "tree", 9), name: "Big" });
    const { gltf: gltf2 } = await exportOf(big);
    const bigger =
      gltf2.accessors[
        gltf2.meshes[named(gltf2, "Big wood")!.mesh!]!.primitives[0]!
          .attributes["POSITION"]!
      ]!.count;
    expect(bigger).toBeGreaterThan(small);
  });

  it("a plant keeps its place in the scene", async () => {
    let scene = createEmptyScene();
    scene = addNode(scene, {
      ...createPlantNode("p", "pine", 2),
      name: "Pine",
      transform: {
        position: [3, 0, 4],
        rotation: [0, 0, 0],
        scale: [1.5, 1.5, 1.5],
      },
    });
    const { gltf } = await exportOf(scene);
    const pine = named(gltf, "Pine")!;
    expect(pine.translation).toEqual([3, 0, 4]);
    expect(pine.scale).toEqual([1.5, 1.5, 1.5]);
  });
});
