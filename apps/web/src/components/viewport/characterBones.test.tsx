import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { _roots, createRoot, extend } from "@react-three/fiber";
import * as THREE from "three";
import {
  BONE_MOTION,
  BONE_PARENT,
  CHARACTER_BONES,
  DEFAULT_CHARACTER,
  POSE_PRESETS,
  POSE_PRESET_NAMES,
  boneMatrices,
  boneRotation,
  buildParts,
  createRandom,
  groundLift,
  proportions,
  restOffsets,
  type CharacterBone,
  type CharacterSettings,
  createNode,
} from "@sceneroom/shared";
import { useCharacterViewStore } from "@/store/characterViewStore";
import CharacterObject from "./CharacterObject";

extend(THREE as never);
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The same bone groups CharacterObject draws, built by hand: a group at each joint, turned by the pose. */
function handBuilt(
  s: CharacterSettings,
): Record<CharacterBone, THREE.Object3D> {
  const offsets = restOffsets(proportions(s));
  const lift = groundLift(s);
  const bones = {} as Record<CharacterBone, THREE.Object3D>;
  for (const bone of CHARACTER_BONES) {
    const object = new THREE.Object3D();
    const [x, y, z] = offsets[bone];
    object.position.set(x, bone === "hips" ? y + lift : y, z);
    object.rotation.set(...boneRotation(bone, s.pose[bone]));
    const parent = BONE_PARENT[bone];
    if (parent) bones[parent].add(object);
    bones[bone] = object;
  }
  bones.hips.updateMatrixWorld(true);
  return bones;
}

/** A pose with every channel of every bone at some value inside its limits. */
function randomPose(seed: number): CharacterSettings["pose"] {
  const random = createRandom(seed);
  const pose: CharacterSettings["pose"] = {};
  for (const bone of CHARACTER_BONES) {
    const m = BONE_MOTION[bone];
    const pick = ([min, max]: [number, number]) => min + random() * (max - min);
    pose[bone] = [pick(m.swing), pick(m.out), pick(m.twist)];
  }
  return pose;
}

describe("the bone maths matches three.js exactly", () => {
  it("the matrix of every bone equals the world matrix of three.js groups turned the same way, in every pose", () => {
    const poses = [
      ...POSE_PRESET_NAMES.map((n) => POSE_PRESETS[n]),
      ...[1, 2, 3, 4, 5].map(randomPose),
    ];
    for (const pose of poses) {
      const s: CharacterSettings = { ...DEFAULT_CHARACTER, pose };
      const lift = groundLift(s);
      const ours = boneMatrices(s, lift);
      const theirs = handBuilt(s);
      for (const bone of CHARACTER_BONES) {
        const expected = theirs[bone].matrixWorld.elements;
        for (let i = 0; i < 16; i++)
          expect(ours[bone][i]!).toBeCloseTo(expected[i]!, 9);
      }
    }
  });

  it("also for a different build and size", () => {
    const s: CharacterSettings = {
      ...DEFAULT_CHARACTER,
      height: 0.9,
      build: 1,
      headSize: 1.5,
      legRatio: 0.4,
      pose: randomPose(9),
    };
    const ours = boneMatrices(s, groundLift(s));
    const theirs = handBuilt(s);
    for (const bone of CHARACTER_BONES) {
      for (let i = 0; i < 16; i++)
        expect(ours[bone][i]!).toBeCloseTo(
          theirs[bone].matrixWorld.elements[i]!,
          9,
        );
    }
  });
});

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

async function mount(children: React.ReactNode): Promise<{
  scene: THREE.Scene;
  rerender: (next: React.ReactNode) => Promise<void>;
}> {
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
  return {
    scene: _roots.get(canvas)!.store.getState().scene,
    rerender: async (next) => {
      await act(async () => root.render(next));
    },
  };
}

const material = createNode("m", "cube").material;
const render = (character: CharacterSettings, selected = false) => (
  <group name="person">
    <CharacterObject
      character={character}
      material={material}
      selected={selected}
      cut={false}
    />
  </group>
);

const meshesOf = (scene: THREE.Scene) => {
  const found: THREE.Mesh[] = [];
  scene.getObjectByName("person")!.traverse((o) => {
    if (
      o instanceof THREE.Mesh &&
      o.geometry instanceof THREE.BufferGeometry &&
      o.geometry.getAttribute("position")?.count > 0 &&
      !(o.material as THREE.Material).visible === false
    )
      found.push(o);
  });
  return found;
};

beforeEach(() => {
  useCharacterViewStore.setState({ showSkeleton: false });
});

describe("the character on screen", () => {
  it("draws a group for every bone, nested like the skeleton, with a mesh for every body part", async () => {
    const { scene } = await mount(render(DEFAULT_CHARACTER));
    const root = scene.getObjectByName("person")!;
    for (const bone of CHARACTER_BONES) {
      const group = root.getObjectByName(bone);
      expect(group, bone).toBeDefined();
      const parent = BONE_PARENT[bone];
      if (parent) expect(group!.parent).toBe(root.getObjectByName(parent));
    }
    const parts = buildParts(DEFAULT_CHARACTER).length;
    expect(meshesOf(scene)).toHaveLength(parts);
  });

  it("the groups have the same world matrices as the maths, so what is drawn is what is baked and exported", async () => {
    const pose = randomPose(11);
    const s: CharacterSettings = { ...DEFAULT_CHARACTER, pose };
    const { scene } = await mount(render(s));
    scene.updateMatrixWorld(true);
    const expected = boneMatrices(s, groundLift(s));
    for (const bone of CHARACTER_BONES) {
      const drawn = scene.getObjectByName(bone)!.matrixWorld.elements;
      for (let i = 0; i < 16; i++)
        expect(drawn[i]!).toBeCloseTo(expected[bone][i]!, 9);
    }
  });

  it("posing only turns the groups: the geometry of the body is not built again", async () => {
    const { scene, rerender } = await mount(render(DEFAULT_CHARACTER));
    const before = meshesOf(scene).map((m) => m.geometry);
    await rerender(render({ ...DEFAULT_CHARACTER, pose: POSE_PRESETS.walk }));
    const after = meshesOf(scene).map((m) => m.geometry);
    expect(after).toHaveLength(before.length);
    after.forEach((geometry, i) => expect(geometry).toBe(before[i]));
    // but the legs did turn
    const thigh = scene.getObjectByName("upperLeg.L")!;
    expect(thigh.rotation.x).not.toBe(0);
  });

  it("changing a colour does not rebuild the body either, but changing the height does", async () => {
    const { scene, rerender } = await mount(render(DEFAULT_CHARACTER));
    const before = meshesOf(scene).map((m) => m.geometry);
    await rerender(render({ ...DEFAULT_CHARACTER, shirtColor: "#ff0000" }));
    expect(meshesOf(scene).map((m) => m.geometry)).toEqual(before);
    await rerender(render({ ...DEFAULT_CHARACTER, height: 2.4 }));
    expect(meshesOf(scene)[0]!.geometry).not.toBe(before[0]);
  });

  it("the parts take their colours from the character", async () => {
    const { scene } = await mount(
      render({
        ...DEFAULT_CHARACTER,
        shirtColor: "#ff0000",
        skinColor: "#00ff00",
      }),
    );
    const torso = scene
      .getObjectByName("spine")!
      .children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;
    expect(
      (torso.material as THREE.MeshStandardMaterial).color.getHexString(),
    ).toBe("ff0000");
    const neck = scene
      .getObjectByName("neck")!
      .children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;
    expect(
      (neck.material as THREE.MeshStandardMaterial).color.getHexString(),
    ).toBe("00ff00");
  });

  it("a sitting character is lowered onto the ground", async () => {
    const { scene } = await mount(
      render({ ...DEFAULT_CHARACTER, pose: POSE_PRESETS.sit }),
    );
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const mesh of meshesOf(scene)) box.expandByObject(mesh);
    expect(box.min.y).toBeCloseTo(0, 3);
  });

  it("selecting shows a box round the character, and every geometry stays valid", async () => {
    const { scene } = await mount(render(DEFAULT_CHARACTER, true));
    // the edges of the box are drei's thick line type
    let edges = 0;
    scene.traverse((o) => {
      if (o.type === "LineSegments2") edges += 1;
    });
    expect(edges).toBe(1);
    // and an unselected character has none
    const plain = await mount(render(DEFAULT_CHARACTER, false));
    let none = 0;
    plain.scene.traverse((o) => {
      if (o.type === "LineSegments2") none += 1;
    });
    expect(none).toBe(0);
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const g = o.geometry as THREE.BufferGeometry;
        expect(g.index).not.toBeUndefined();
      }
    });
  });

  it("the skeleton is drawn only while it is switched on and the character is selected", async () => {
    const countJoints = (scene: THREE.Scene) => {
      let n = 0;
      scene.traverse((o) => {
        if (
          o instanceof THREE.Mesh &&
          o.geometry instanceof THREE.SphereGeometry &&
          o.renderOrder === 20
        )
          n += 1;
      });
      return n;
    };
    const { scene, rerender } = await mount(render(DEFAULT_CHARACTER, true));
    expect(countJoints(scene)).toBe(0);
    useCharacterViewStore.setState({ showSkeleton: true });
    await rerender(render({ ...DEFAULT_CHARACTER }, true));
    expect(countJoints(scene)).toBe(CHARACTER_BONES.length);
    await rerender(render({ ...DEFAULT_CHARACTER }, false));
    expect(countJoints(scene)).toBe(0);
  });
});
