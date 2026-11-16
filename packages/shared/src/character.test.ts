import { describe, expect, it } from "vitest";
import { checkMesh } from "./meshData";
import {
  BONE_MOTION,
  BONE_PARENT,
  CHARACTER_PRESETS,
  CHARACTER_PRESET_NAMES,
  COLOR_ROLES,
  POSE_PRESETS,
  POSE_PRESET_NAMES,
  bakeCharacter,
  bakeCharacterToMeshes,
  boneRotation,
  buildParts,
  characterBounds,
  characterChangeDiffers,
  createCharacterNode,
  createCharacterRandomiser,
  groundLift,
  jointPositions,
  proportions,
  randomiseLook,
  restOffsets,
  roleColor,
  sameCharacter,
  samePose,
  sanitizeCharacterChange,
  sanitizePose,
  scatterCharacters,
  setCharacter,
} from "./character";
import { createRandom, scatterSpots } from "./plant";
import {
  CHARACTER_BONES,
  DEFAULT_CHARACTER,
  characterSchema,
  createEmptyScene,
  sceneNodeSchema,
  type CharacterSettings,
} from "./scene";
import { addNode, createNode } from "./sceneOps";
import { meshAssetInfo } from "./meshOps";

const settings = (
  change: Partial<CharacterSettings> = {},
): CharacterSettings => ({
  ...DEFAULT_CHARACTER,
  ...change,
});
const posed = (
  pose: CharacterSettings["pose"],
  change: Partial<CharacterSettings> = {},
) => settings({ pose, ...change });

/** The volume inside a closed mesh, positive when its triangles face outwards. */
function signedVolume(mesh: {
  positions: Float32Array;
  indices: Uint32Array;
}): number {
  let volume = 0;
  const p = (i: number) =>
    [
      mesh.positions[i * 3]!,
      mesh.positions[i * 3 + 1]!,
      mesh.positions[i * 3 + 2]!,
    ] as const;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [
      p(mesh.indices[t]!),
      p(mesh.indices[t + 1]!),
      p(mesh.indices[t + 2]!),
    ];
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return volume;
}

describe("the skeleton", () => {
  it("every bone's parent comes before it, and only the hips have none", () => {
    CHARACTER_BONES.forEach((bone, index) => {
      const parent = BONE_PARENT[bone];
      if (bone === "hips") expect(parent).toBeNull();
      else expect(CHARACTER_BONES.indexOf(parent!)).toBeLessThan(index);
    });
    expect(CHARACTER_BONES).toHaveLength(16);
  });

  it("at rest the feet are on the ground, the hips at the leg length, and the head about as high as the character", () => {
    const joints = jointPositions(settings());
    const p = proportions(settings());
    expect(joints.hips[1]).toBeCloseTo(p.legLength, 6);
    expect(joints["foot.L"][1]).toBeCloseTo(p.footHeight, 6);
    expect(joints["foot.R"][1]).toBeCloseTo(p.footHeight, 6);
    const top = characterBounds(settings()).max[1];
    expect(top).toBeGreaterThan(1.7 * 0.95);
    expect(top).toBeLessThan(1.7 * 1.05);
  });

  it("the left side is the +x side, the right side -x, and the body is centred", () => {
    const joints = jointPositions(settings());
    for (const pair of [
      "upperArm",
      "foreArm",
      "hand",
      "upperLeg",
      "lowerLeg",
      "foot",
    ]) {
      expect(joints[`${pair}.L` as keyof typeof joints][0]).toBeGreaterThan(0);
      expect(joints[`${pair}.R` as keyof typeof joints][0]).toBeCloseTo(
        -joints[`${pair}.L` as keyof typeof joints][0],
        6,
      );
    }
    expect(joints.hips[0]).toBe(0);
    expect(joints.head[0]).toBe(0);
  });

  it("a taller character is bigger in proportion, a child has a bigger head and shorter legs", () => {
    const tall = characterBounds(settings({ height: 2 })).max[1];
    const normal = characterBounds(settings({ height: 1 })).max[1];
    expect(tall / normal).toBeCloseTo(2, 3);
    const child = proportions(CHARACTER_PRESETS.child);
    const adult = proportions(CHARACTER_PRESETS.person);
    expect(child.headRadius[1] / child.height).toBeGreaterThan(
      adult.headRadius[1] / adult.height,
    );
    expect(child.legLength / child.height).toBeLessThan(
      adult.legLength / adult.height,
    );
  });

  it("a stocky character is broader than a slim one", () => {
    const width = (build: number) => {
      const b = characterBounds(settings({ build }));
      return b.max[0]! - b.min[0]!;
    };
    expect(width(0)).toBeLessThan(width(1));
  });

  it("rest offsets hang the limbs down from their joints", () => {
    const offsets = restOffsets(proportions(settings()));
    expect(offsets["foreArm.L"][1]).toBeLessThan(0);
    expect(offsets["lowerLeg.R"][1]).toBeLessThan(0);
    expect(offsets.head[1]).toBeGreaterThan(0);
  });
});

describe("the body parts", () => {
  it("are all valid meshes", () => {
    for (const name of CHARACTER_PRESET_NAMES) {
      for (const part of buildParts(CHARACTER_PRESETS[name])) {
        expect(checkMesh(part.mesh)).toBeNull();
      }
    }
  });

  it("every closed part faces outwards (a positive volume): the body, limbs, hands, feet, head and eyes", () => {
    for (const part of buildParts(settings())) {
      if (part.role === "hair") continue; // a cap of hair is open at the front and bottom
      expect(signedVolume(part.mesh)).toBeGreaterThan(0);
    }
  });

  it("each bone has the parts it should", () => {
    const parts = buildParts(settings());
    const has = (bone: string, role: string) =>
      parts.some((p) => p.bone === bone && p.role === role);
    expect(has("head", "skin")).toBe(true);
    expect(has("head", "eyes")).toBe(true);
    expect(has("head", "hair")).toBe(true);
    expect(has("spine", "shirt")).toBe(true);
    expect(has("foot.L", "shoes")).toBe(true);
    expect(has("upperLeg.R", "pants")).toBe(true);
  });

  it("bald means no hair; long hair has more than short hair", () => {
    const hairTriangles = (hair: CharacterSettings["hair"]) =>
      buildParts(settings({ hair }))
        .filter((p) => p.role === "hair")
        .reduce((n, p) => n + p.mesh.indices.length / 3, 0);
    expect(hairTriangles("bald")).toBe(0);
    expect(hairTriangles("short")).toBeGreaterThan(0);
    expect(hairTriangles("long")).toBeGreaterThan(hairTriangles("short"));
  });

  it("sleeves and trousers decide what colour the forearms and shins are", () => {
    const roleOf = (bone: string, change: Partial<CharacterSettings>) =>
      buildParts(settings(change)).find(
        (p) => p.bone === bone && p.role !== "eyes" && p.role !== "hair",
      )!.role;
    expect(roleOf("foreArm.L", { longSleeves: false })).toBe("skin");
    expect(roleOf("foreArm.L", { longSleeves: true })).toBe("shirt");
    expect(roleOf("lowerLeg.R", { longPants: true })).toBe("pants");
    expect(roleOf("lowerLeg.R", { longPants: false })).toBe("skin");
  });

  it("the roles take the character's colours", () => {
    const s = settings({
      skinColor: "#111111",
      hairColor: "#222222",
      shirtColor: "#333333",
      pantsColor: "#444444",
      shoesColor: "#555555",
    });
    expect(COLOR_ROLES.map((r) => roleColor(s, r)).slice(0, 5)).toEqual([
      "#111111",
      "#222222",
      "#333333",
      "#444444",
      "#555555",
    ]);
    expect(roleColor(s, "eyes")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("a different pose does not change the parts (only where the bones are)", () => {
    const a = buildParts(settings());
    const b = buildParts(posed(POSE_PRESETS.run));
    expect(a.map((p) => Array.from(p.mesh.positions))).toEqual(
      b.map((p) => Array.from(p.mesh.positions)),
    );
  });
});

describe("posing", () => {
  const dist = (a: readonly number[], b: readonly number[]) =>
    Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

  it("T-pose: the arms go straight out to the sides at shoulder height, on both sides", () => {
    const s = settings();
    const rest = jointPositions(s);
    const t = jointPositions({ ...s, pose: POSE_PRESETS.tpose });
    for (const side of ["L", "R"] as const) {
      const sign = side === "L" ? 1 : -1;
      const shoulder = t[`upperArm.${side}`];
      const hand = t[`hand.${side}`];
      // the hand is out beyond the shoulder in the right direction, level with it, and the arm keeps its length
      expect(sign * (hand[0] - shoulder[0])).toBeGreaterThan(0.5);
      expect(Math.abs(hand[1] - shoulder[1])).toBeLessThan(0.02);
      expect(Math.abs(hand[2] - shoulder[2])).toBeLessThan(0.02);
      expect(dist(hand, shoulder)).toBeCloseTo(
        dist(rest[`hand.${side}`], rest[`upperArm.${side}`]),
        5,
      );
    }
  });

  it("swinging an arm forwards moves the hand forwards (+z), on both sides", () => {
    for (const side of ["L", "R"] as const) {
      const joints = jointPositions(
        posed({
          [`upperArm.${side}`]: [90, 0, 0],
        } as CharacterSettings["pose"]),
      );
      const hand = joints[`hand.${side}`];
      const shoulder = joints[`upperArm.${side}`];
      expect(hand[2] - shoulder[2]).toBeGreaterThan(0.4);
      expect(Math.abs(hand[1] - shoulder[1])).toBeLessThan(0.02);
    }
  });

  it("an elbow bends so the hand comes forwards, a knee so the foot goes back, and a hip swing puts the leg forwards", () => {
    const elbow = jointPositions(posed({ "foreArm.L": [90, 0, 0] }));
    expect(elbow["hand.L"][2] - elbow["foreArm.L"][2]).toBeGreaterThan(0.2);
    const knee = jointPositions(posed({ "lowerLeg.R": [90, 0, 0] }));
    expect(knee["foot.R"][2] - knee["lowerLeg.R"][2]).toBeLessThan(-0.2);
    const hip = jointPositions(
      posed({ "upperLeg.L": [60, 0, 0] }, { onGround: false }),
    );
    expect(hip["lowerLeg.L"][2] - hip["upperLeg.L"][2]).toBeGreaterThan(0.3);
  });

  it("raising an arm out reaches up above the shoulder", () => {
    const joints = jointPositions(posed({ "upperArm.R": [0, 150, 0] }));
    expect(joints["hand.R"][1]).toBeGreaterThan(joints["upperArm.R"][1] + 0.2);
    expect(joints["hand.R"][0]).toBeLessThan(joints["upperArm.R"][0]); // still out on the right (-x)
  });

  it("walking puts the left foot ahead of the right, running more so", () => {
    const walk = jointPositions({ ...settings(), pose: POSE_PRESETS.walk });
    expect(walk["foot.L"][2]).toBeGreaterThan(walk["foot.R"][2]);
    const run = jointPositions({ ...settings(), pose: POSE_PRESETS.run });
    expect(run["foot.L"][2] - run["foot.R"][2]).toBeGreaterThan(
      walk["foot.L"][2] - walk["foot.R"][2],
    );
  });

  it("sitting puts the knees forward at hip height and the body down on the ground", () => {
    const s = { ...settings(), pose: POSE_PRESETS.sit };
    const joints = jointPositions(s);
    expect(joints["lowerLeg.L"][2] - joints.hips[2]).toBeGreaterThan(0.3);
    expect(
      Math.abs(joints["lowerLeg.L"][1] - joints["upperLeg.L"][1]),
    ).toBeLessThan(0.02);
    expect(joints.hips[1]).toBeLessThan(proportions(s).legLength * 0.6);
    expect(groundLift(s)).toBeLessThan(-0.1);
  });

  it("the body always stands on the ground when that is on: its lowest point is at 0", () => {
    for (const name of POSE_PRESET_NAMES) {
      const s = { ...settings(), pose: POSE_PRESETS[name] };
      expect(characterBounds(s).min[1]).toBeCloseTo(0, 5);
    }
    expect(groundLift(settings())).toBeCloseTo(0, 5);
  });

  it("with 'on the ground' off the pose does not move the body up or down", () => {
    const s = { ...settings(), pose: POSE_PRESETS.sit, onGround: false };
    expect(groundLift(s)).toBe(0);
    // the body is not put on the ground: a sitting pose with the hips at standing height floats above it
    expect(characterBounds(s).min[1]).toBeGreaterThan(0.2);
  });

  it("a symmetric pose is a mirror image: left and right joints match with x negated", () => {
    const channels: [number, number, number] = [37, 21, -15];
    const pose: CharacterSettings["pose"] = {};
    for (const part of [
      "upperArm",
      "foreArm",
      "hand",
      "upperLeg",
      "lowerLeg",
      "foot",
    ] as const) {
      const [lo, hi] = [BONE_MOTION[`${part}.L`], BONE_MOTION[`${part}.R`]];
      expect(lo.swing).toEqual(hi.swing);
      const clamp = (v: number, [min, max]: [number, number]) =>
        Math.min(max, Math.max(min, v));
      const angles: [number, number, number] = [
        clamp(channels[0], lo.swing),
        clamp(channels[1], lo.out),
        clamp(channels[2], lo.twist),
      ];
      pose[`${part}.L`] = angles;
      pose[`${part}.R`] = angles;
    }
    const joints = jointPositions(posed(pose, { onGround: false }));
    for (const part of [
      "upperArm",
      "foreArm",
      "hand",
      "upperLeg",
      "lowerLeg",
      "foot",
    ]) {
      const left = joints[`${part}.L` as keyof typeof joints];
      const right = joints[`${part}.R` as keyof typeof joints];
      expect(right[0]).toBeCloseTo(-left[0], 5);
      expect(right[1]).toBeCloseTo(left[1], 5);
      expect(right[2]).toBeCloseTo(left[2], 5);
    }
  });

  it("turning the head moves nothing below it, bending the spine moves the head", () => {
    const rest = jointPositions(settings({ onGround: false }));
    const turned = jointPositions(
      posed({ head: [0, 0, 60] }, { onGround: false }),
    );
    expect(turned.hips).toEqual(rest.hips);
    expect(turned["hand.L"]).toEqual(rest["hand.L"]);
    const bent = jointPositions(
      posed({ spine: [40, 0, 0] }, { onGround: false }),
    );
    expect(bent.head[2]).toBeGreaterThan(rest.head[2] + 0.1);
  });

  it("every pose preset is valid for the joint limits", () => {
    for (const name of POSE_PRESET_NAMES) {
      expect(
        samePose(sanitizePose(POSE_PRESETS[name]), POSE_PRESETS[name]),
      ).toBe(true);
    }
  });

  it("an empty pose is the pose at rest", () => {
    expect(boneRotation("head", undefined)).toEqual([0, 0, 0]);
    expect(samePose({}, { head: [0, 0, 0] })).toBe(true);
  });
});

describe("making meshes of a character", () => {
  it("makes one mesh per colour in use, standing on the ground, each a valid mesh", () => {
    const meshes = bakeCharacter(settings());
    expect(Object.keys(meshes).sort()).toEqual([
      "eyes",
      "hair",
      "pants",
      "shirt",
      "shoes",
      "skin",
    ]);
    let lowest = Infinity;
    for (const mesh of Object.values(meshes)) {
      expect(checkMesh(mesh!)).toBeNull();
      for (let i = 1; i < mesh!.positions.length; i += 3)
        lowest = Math.min(lowest, mesh!.positions[i]!);
    }
    expect(lowest).toBeCloseTo(0, 5);
  });

  it("a bald character has no hair mesh", () => {
    expect(bakeCharacter(settings({ hair: "bald" })).hair).toBeUndefined();
  });

  it("has all the points of the parts, in the posed places", () => {
    const s = { ...settings(), pose: POSE_PRESETS.tpose };
    const total = Object.values(bakeCharacter(s)).reduce(
      (n, m) => n + m!.positions.length,
      0,
    );
    expect(total).toBe(
      buildParts(s).reduce((n, p) => n + p.mesh.positions.length, 0),
    );
    // the arms are out: the baked skin is wider than at rest
    const width = (c: CharacterSettings) => {
      const m = bakeCharacter(c).skin!;
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < m.positions.length; i += 3) {
        min = Math.min(min, m.positions[i]!);
        max = Math.max(max, m.positions[i]!);
      }
      return max - min;
    };
    expect(width(s)).toBeGreaterThan(width(settings()) * 2);
  });
});

describe("the character object and its settings", () => {
  it("each kind passes the schema and is a different character", () => {
    for (const name of CHARACTER_PRESET_NAMES) {
      expect(characterSchema.safeParse(CHARACTER_PRESETS[name]).success).toBe(
        true,
      );
      const node = createCharacterNode("c", name);
      expect(node.kind).toBe("character");
      expect(node.material.flatShading).toBe(true);
      expect(sceneNodeSchema.safeParse(node).success).toBe(true);
    }
    expect(CHARACTER_PRESETS.child.height).toBeLessThan(
      CHARACTER_PRESETS.tall.height,
    );
  });

  it("an older object loads with no character, and the schema refuses bad values", () => {
    const { character, ...old } = createNode("a", "cube");
    void character;
    expect(sceneNodeSchema.parse(old).character).toBeNull();
    const bad = (change: object) =>
      characterSchema.safeParse({ ...DEFAULT_CHARACTER, ...change }).success;
    expect(bad({ height: 9 })).toBe(false);
    expect(bad({ hair: "mohawk" })).toBe(false);
    expect(bad({ skinColor: "tan" })).toBe(false);
    expect(bad({ pose: { tail: [0, 0, 0] } })).toBe(false);
    expect(bad({ pose: { head: [0, 0] } })).toBe(false);
    expect(bad({ pose: { head: [10, 0, 0] } })).toBe(true);
  });

  it("changes are cleaned: numbers kept in range, colours checked, hair and switches checked, nonsense dropped", () => {
    expect(
      sanitizeCharacterChange({ height: 99, build: -2, headSize: 1.2 }),
    ).toEqual({ height: 3, build: 0, headSize: 1.2 });
    expect(
      sanitizeCharacterChange({ skinColor: "#ABCDEF", hairColor: "brown" }),
    ).toEqual({ skinColor: "#abcdef" });
    expect(
      sanitizeCharacterChange({ hair: "long", longSleeves: true }),
    ).toEqual({ hair: "long", longSleeves: true });
    expect(
      sanitizeCharacterChange({
        hair: "mohawk" as never,
        longPants: "yes" as never,
        height: NaN,
      }),
    ).toEqual({});
  });

  it("a pose is cleaned bone by bone: joint limits, unknown bones and bad numbers dropped, rest bones left out", () => {
    const clean = sanitizePose({
      "lowerLeg.L": [-30, 5, 999], // a knee cannot bend backwards, cannot swing out, twist is limited
      "upperArm.R": [10, 20, 30],
      tail: [1, 2, 3],
      head: [0, 0, 0],
      "hand.L": [NaN, 0, 0],
      "foot.R": [1, 2],
    });
    expect(clean["lowerLeg.L"]).toEqual([0, 0, 30]);
    expect(clean["upperArm.R"]).toEqual([10, 20, 30]);
    expect(Object.keys(clean).sort()).toEqual(["lowerLeg.L", "upperArm.R"]);
    expect(sanitizePose("nonsense")).toEqual({});
    expect(sanitizePose(null)).toEqual({});
  });

  it("sees whether a change alters anything, including a pose that is the same angles", () => {
    expect(characterChangeDiffers(DEFAULT_CHARACTER, { height: 1.7 })).toBe(
      false,
    );
    expect(characterChangeDiffers(DEFAULT_CHARACTER, { height: 1.8 })).toBe(
      true,
    );
    expect(characterChangeDiffers(DEFAULT_CHARACTER, { pose: {} })).toBe(false);
    expect(
      characterChangeDiffers(DEFAULT_CHARACTER, { pose: { head: [0, 0, 0] } }),
    ).toBe(false);
    expect(
      characterChangeDiffers(DEFAULT_CHARACTER, { pose: { head: [5, 0, 0] } }),
    ).toBe(true);
    expect(characterChangeDiffers(DEFAULT_CHARACTER, {})).toBe(false);
  });

  it("setCharacter changes some settings and keeps the others; it refuses an object that is not a character", () => {
    let scene = addNode(createEmptyScene(), createCharacterNode("c", "person"));
    scene = setCharacter(scene, "c", { height: 2, pose: POSE_PRESETS.wave });
    expect(scene.nodes["c"]?.character).toMatchObject({
      height: 2,
      hair: "short",
    });
    const cube = addNode(createEmptyScene(), createNode("a", "cube"));
    expect(() => setCharacter(cube, "a", { height: 1 })).toThrow(
      "not a character",
    );
    expect(() => setCharacter(cube, "nope", { height: 1 })).toThrow(
      "does not exist",
    );
  });
});

describe("randomising the look", () => {
  it("the same random stream gives the same look; the pose is not touched", () => {
    const base = { ...DEFAULT_CHARACTER, pose: POSE_PRESETS.walk };
    expect(randomiseLook(base, createRandom(4))).toEqual(
      randomiseLook(base, createRandom(4)),
    );
    expect(randomiseLook(base, createRandom(4))).not.toEqual(
      randomiseLook(base, createRandom(5)),
    );
    expect(randomiseLook(base, createRandom(4)).pose).toBeUndefined();
  });

  it("makes valid colours and settings, always inside the allowed ranges", () => {
    for (let seed = 0; seed < 300; seed++) {
      const change = randomiseLook(DEFAULT_CHARACTER, createRandom(seed), 1);
      expect(
        characterSchema.safeParse({ ...DEFAULT_CHARACTER, ...change }).success,
      ).toBe(true);
    }
  });

  it("pressing the button many times never drifts: the height stays within a little of where it started", () => {
    const randomise = createCharacterRandomiser();
    const random = createRandom(2);
    let character: CharacterSettings = DEFAULT_CHARACTER;
    let sum = 0;
    let lowest = Infinity;
    let highest = -Infinity;
    const presses = 1000;
    for (let i = 0; i < presses; i++) {
      character = { ...character, ...randomise(character, random) };
      sum += character.height;
      lowest = Math.min(lowest, character.height);
      highest = Math.max(highest, character.height);
    }
    expect(lowest).toBeGreaterThanOrEqual(1.7 / 1.12 - 1e-9);
    expect(highest).toBeLessThanOrEqual(1.7 * 1.12 + 1e-9);
    expect(Math.abs(sum / presses - 1.7)).toBeLessThan(0.05);
  });

  it("starts from a new character when the person changes something", () => {
    const randomise = createCharacterRandomiser();
    const random = createRandom(8);
    let character: CharacterSettings = DEFAULT_CHARACTER;
    character = { ...character, ...randomise(character, random) };
    character = { ...character, height: 2.6 };
    for (let i = 0; i < 50; i++) {
      character = { ...character, ...randomise(character, random) };
      expect(character.height).toBeGreaterThan(2.6 / 1.12 - 1e-9);
    }
  });

  it("two characters are the same only when everything is, the pose included", () => {
    expect(sameCharacter(DEFAULT_CHARACTER, { ...DEFAULT_CHARACTER })).toBe(
      true,
    );
    expect(
      sameCharacter(DEFAULT_CHARACTER, {
        ...DEFAULT_CHARACTER,
        pose: { head: [1, 0, 0] },
      }),
    ).toBe(false);
    expect(
      sameCharacter(DEFAULT_CHARACTER, {
        ...DEFAULT_CHARACTER,
        shirtColor: "#000000",
      }),
    ).toBe(false);
  });
});

describe("a crowd", () => {
  it("adds a copy at each spot with its own look, the same pose, in the same parent", () => {
    let scene = createEmptyScene();
    scene = addNode(scene, {
      ...createCharacterNode("p", "person"),
      character: { ...DEFAULT_CHARACTER, pose: POSE_PRESETS.wave },
    });
    const spots = scatterSpots({
      seed: 1,
      count: 12,
      radius: 8,
      spacing: 1,
      sizeVariation: 0.1,
      firstSeed: 5,
    });
    let n = 0;
    const result = scatterCharacters(scene, "p", spots, () => `npc${++n}`);
    expect(result.ids.length).toBe(spots.length);
    const looks = new Set(
      result.ids.map(
        (id) =>
          result.scene.nodes[id]!.character!.shirtColor +
          result.scene.nodes[id]!.character!.skinColor,
      ),
    );
    expect(looks.size).toBeGreaterThan(3);
    for (const id of result.ids) {
      const copy = result.scene.nodes[id]!;
      expect(copy.kind).toBe("character");
      expect(samePose(copy.character!.pose, POSE_PRESETS.wave)).toBe(true);
      expect(copy.name).not.toBe("Person");
      expect(
        Math.hypot(copy.transform.position[0], copy.transform.position[2]),
      ).toBeLessThanOrEqual(8);
    }
    expect(result.scene.nodes["p"]).toBe(scene.nodes["p"]);
  });

  it("the same spots always give the same crowd", () => {
    const scene = addNode(
      createEmptyScene(),
      createCharacterNode("p", "person"),
    );
    const spots = scatterSpots({
      seed: 3,
      count: 5,
      radius: 5,
      spacing: 1,
      sizeVariation: 0.1,
      firstSeed: 9,
    });
    const make = () => {
      let n = 0;
      return scatterCharacters(scene, "p", spots, () => `n${++n}`).scene;
    };
    expect(make()).toEqual(make());
  });

  it("refuses an object that is not a character", () => {
    const scene = addNode(createEmptyScene(), createNode("c", "cube"));
    expect(() => scatterCharacters(scene, "c", [], () => "x")).toThrow(
      "not a character",
    );
  });
});

describe("bakeCharacterToMeshes", () => {
  const square = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };
  const info = (id: string) => meshAssetInfo(id, id, square, 10);
  const scene = () => {
    let s = createEmptyScene();
    s = addNode(s, {
      ...createCharacterNode("c", "person"),
      transform: {
        position: [1, 0, 2],
        rotation: [0, 0.5, 0],
        scale: [2, 2, 2],
      },
    });
    s = addNode(s, { ...createNode("hat", "cube"), parentId: "c" });
    return s;
  };

  it("the character becomes its skin mesh in place, and every other colour a mesh inside it", () => {
    const before = scene();
    const after = bakeCharacterToMeshes(before, "c", [
      { role: "skin", info: info("skin"), nodeId: "x" },
      { role: "shirt", info: info("shirt"), nodeId: "shirt-node" },
      { role: "hair", info: info("hair"), nodeId: "hair-node" },
    ]);
    expect(after.nodes["c"]).toMatchObject({
      kind: "mesh",
      assetId: "skin",
      character: null,
      color: DEFAULT_CHARACTER.skinColor,
      transform: {
        position: [1, 0, 2],
        rotation: [0, 0.5, 0],
        scale: [2, 2, 2],
      },
    });
    expect(after.nodes["shirt-node"]).toMatchObject({
      kind: "mesh",
      assetId: "shirt",
      parentId: "c",
      color: DEFAULT_CHARACTER.shirtColor,
      name: "Person shirt",
    });
    expect(after.nodes["hair-node"]).toMatchObject({
      color: DEFAULT_CHARACTER.hairColor,
    });
    expect(after.nodes["shirt-node"]?.transform).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    expect(after.nodes["hat"]?.parentId).toBe("c");
    expect(Object.keys(after.assets).sort()).toEqual(["hair", "shirt", "skin"]);
    expect(before.nodes["c"]?.kind).toBe("character");
  });

  it("refuses an object that is not a character, missing skin, and data that is not a mesh", () => {
    const cube = addNode(createEmptyScene(), createNode("a", "cube"));
    expect(() =>
      bakeCharacterToMeshes(cube, "a", [
        { role: "skin", info: info("s"), nodeId: "x" },
      ]),
    ).toThrow("not a character");
    expect(() =>
      bakeCharacterToMeshes(scene(), "c", [
        { role: "shirt", info: info("s"), nodeId: "x" },
      ]),
    ).toThrow("skin");
    expect(() =>
      bakeCharacterToMeshes(scene(), "c", [
        { role: "skin", info: { ...info("s"), type: "model" }, nodeId: "x" },
      ]),
    ).toThrow("not a mesh");
    expect(() => bakeCharacterToMeshes(scene(), "nope", [])).toThrow(
      "does not exist",
    );
  });
});
