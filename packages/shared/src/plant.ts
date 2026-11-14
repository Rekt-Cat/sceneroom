import { z } from "zod";
import type { Vec3 } from "./index";
import type { ShapeMesh } from "./modifiers";
import { normalizeHexColor } from "./color";
import {
  plantSchema,
  type PlantSettings,
  type Scene,
  type SceneNode,
} from "./scene";
import { addNode, availableName, createNode } from "./sceneOps";

// ---- Presets ----

/** The kinds of plant that can be added, each a starting set of numbers (all of them can be changed afterwards). */
export const PLANT_PRESET_NAMES = ["tree", "pine", "bush"] as const;
export type PlantPresetName = (typeof PLANT_PRESET_NAMES)[number];

/** What each preset is called and how it looks, for the Add menu and the Inspector. */
export const PLANT_PRESET_INFO: Record<
  PlantPresetName,
  { label: string; hint: string; barkColor: string }
> = {
  tree: {
    label: "Tree",
    hint: "A trunk with spreading branches and round leaf lumps",
    barkColor: "#7a5230",
  },
  pine: {
    label: "Pine",
    hint: "A tall trunk with short, drooping layers of branches",
    barkColor: "#5e4026",
  },
  bush: {
    label: "Bush",
    hint: "Low and bushy, with many branches from the ground",
    barkColor: "#6b4a2b",
  },
};

/** The numbers of each preset (the seed and the trunk colour are not part of it: a preset keeps your seed). */
export const PLANT_PRESETS: Record<PlantPresetName, PlantSettings> = {
  tree: plantSchema.parse({}),
  pine: plantSchema.parse({
    height: 5,
    trunkRadius: 0.1,
    taper: 0.85,
    crookedness: 0.08,
    levels: 1,
    branches: 10,
    branchAngle: 75,
    branchLength: 0.28,
    branchStart: 0.15,
    droop: 0.55,
    leafDensity: 0.9,
    leafSize: 0.45,
    leafColor: "#2f6b3c",
  }),
  bush: plantSchema.parse({
    height: 0.9,
    trunkRadius: 0.05,
    taper: 0.5,
    crookedness: 0.4,
    levels: 2,
    branches: 6,
    branchAngle: 50,
    branchLength: 0.75,
    branchStart: 0.05,
    droop: -0.1,
    leafDensity: 1,
    leafSize: 0.3,
    leafColor: "#5aa845",
  }),
};

// ---- Changing the settings ----

/** A change to some plant settings. */
export type PlantChange = Partial<PlantSettings>;

/** Range of each number setting: [smallest, largest, whole numbers only?]. */
const NUMBER_RANGES = {
  seed: [0, 99999, true],
  height: [0.2, 30, false],
  trunkRadius: [0.005, 2, false],
  taper: [0, 0.95, false],
  crookedness: [0, 1, false],
  levels: [0, 3, true],
  branches: [1, 10, true],
  branchAngle: [5, 90, false],
  branchLength: [0.15, 0.95, false],
  branchStart: [0, 0.9, false],
  droop: [-1, 1, false],
  leafDensity: [0, 1, false],
  leafSize: [0.03, 3, false],
  sides: [3, 12, true],
  rings: [2, 10, true],
} as const;

/**
 * Cleans up a change to plant settings: numbers that are not finite are dropped, the rest are kept inside
 * their range (whole numbers where that is needed); the leaf colour must be a valid hex code; the leaf
 * style must be one of the two. Anything else is dropped.
 */
export function sanitizePlantChange(change: PlantChange): PlantChange {
  const clean: Record<string, unknown> = {};
  for (const [key, [min, max, whole]] of Object.entries(NUMBER_RANGES)) {
    const value = (change as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const limited = Math.min(max, Math.max(min, value));
    clean[key] = whole ? Math.round(limited) : limited;
  }
  if (typeof change.leafColor === "string") {
    const color = normalizeHexColor(change.leafColor);
    if (color !== null) clean["leafColor"] = color;
  }
  if (change.leafStyle === "blobs" || change.leafStyle === "cards") {
    clean["leafStyle"] = change.leafStyle;
  }
  return clean as PlantChange;
}

/** True if applying the (cleaned) change would alter at least one setting. */
export function plantChangeDiffers(
  plant: PlantSettings,
  change: PlantChange,
): boolean {
  return (Object.keys(change) as (keyof PlantSettings)[]).some(
    (key) => change[key] !== undefined && change[key] !== plant[key],
  );
}

/** A new plant object of a preset: standing at the middle of the scene, with its own trunk colour and a random-looking seed. */
export function createPlantNode(
  id: string,
  preset: PlantPresetName,
  seed = 1,
): SceneNode {
  const info = PLANT_PRESET_INFO[preset];
  const base = createNode(id, "cube");
  return {
    ...base,
    name: info.label,
    kind: "plant",
    color: info.barkColor,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    // Faceted shading suits the low-poly look of the lumps and the thin branches
    material: {
      ...base.material,
      flatShading: true,
      roughness: 0.9,
      metalness: 0,
    },
    plant: { ...PLANT_PRESETS[preset], seed },
  };
}

/** Changes some settings of a plant, keeping the others. Throws for an object that is not a plant. */
export function setPlant(scene: Scene, id: string, change: PlantChange): Scene {
  const node = scene.nodes[id];
  if (!node) throw new Error(`Node "${id}" does not exist`);
  if (!node.plant) throw new Error(`Node "${id}" is not a plant`);
  return {
    ...scene,
    nodes: {
      ...scene.nodes,
      [id]: { ...node, plant: { ...node.plant, ...change } },
    },
  };
}

// ---- Growing a plant ----

/** The shape of a plant: the wood (trunk and branches) and the leaves, each a mesh of its own. The leaves can be empty. */
export type GrownPlant = { bark: ShapeMesh; leaves: ShapeMesh };

/** A repeatable stream of random numbers from 0 up to (not including) 1, from a whole-number seed (mulberry32). */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalise = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return length < 1e-12
    ? [0, 1, 0]
    : [a[0] / length, a[1] / length, a[2] / length];
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Some direction at right angles to `direction`. */
function perpendicular(direction: Vec3): Vec3 {
  const axis: Vec3 = Math.abs(direction[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalise(cross(direction, axis));
}

/** A branch: the points along its middle and how thick it is at each. */
type Branch = { points: Vec3[]; radii: number[]; level: number };

/** The smallest radius used, so a tip is never exactly zero. */
const MIN_RADIUS = 0.002;

/**
 * Grows the trunk and all the branches. Each branch is a short chain of points; its direction wanders a
 * little from point to point (crookedness) and leans down or up (droop). Branches grow from the middle
 * and outer part of their parent, spread round it by the golden angle (so they do not line up), at the
 * branch angle, shorter than their parent. Everything comes from the seed, so the same settings always
 * give the same plant.
 */
function growBranches(settings: PlantSettings, random: () => number): Branch[] {
  const branches: Branch[] = [];
  const GOLDEN_ANGLE = 2.399963229728653; // radians

  const grow = (
    start: Vec3,
    direction: Vec3,
    length: number,
    radiusStart: number,
    level: number,
  ): void => {
    const radiusEnd = Math.max(MIN_RADIUS, radiusStart * (1 - settings.taper));
    const points: Vec3[] = [start];
    const radii: number[] = [Math.max(MIN_RADIUS, radiusStart)];
    const directions: Vec3[] = [];
    let current = normalise(direction);
    const step = length / settings.rings;
    for (let i = 1; i <= settings.rings; i++) {
      // A small random push sideways, and the lean of the droop (a trunk does not droop)
      const wander: Vec3 = [random() - 0.5, random() - 0.5, random() - 0.5];
      const lean: Vec3 = [0, level === 0 ? 0 : -settings.droop * 0.18, 0];
      current = normalise(
        add(add(current, scale(wander, settings.crookedness * 0.7)), lean),
      );
      directions.push(current);
      points.push(add(points[i - 1]!, scale(current, step)));
      radii.push(
        Math.max(MIN_RADIUS, lerp(radiusStart, radiusEnd, i / settings.rings)),
      );
    }
    branches.push({ points, radii, level });

    if (level >= settings.levels) return;
    for (let k = 0; k < settings.branches; k++) {
      // Where along the parent this branch starts (spread over the allowed part)
      const along = lerp(
        settings.branchStart,
        0.95,
        (k + random() * 0.8) / settings.branches,
      );
      const position = along * settings.rings;
      const index = Math.min(settings.rings - 1, Math.floor(position));
      const fraction = position - index;
      const origin = add(
        scale(points[index]!, 1 - fraction),
        scale(points[index + 1]!, fraction),
      );
      const parentRadius = lerp(radii[index]!, radii[index + 1]!, fraction);
      const parentDirection = directions[index]!;
      // The new direction: tilted away from the parent by the branch angle, round it by the golden angle
      const side = perpendicular(parentDirection);
      const other = cross(parentDirection, side);
      const azimuth = k * GOLDEN_ANGLE + random() * 0.6;
      const tilt =
        ((settings.branchAngle + (random() - 0.5) * 20) * Math.PI) / 180;
      const around = add(
        scale(side, Math.cos(azimuth)),
        scale(other, Math.sin(azimuth)),
      );
      const childDirection = add(
        scale(parentDirection, Math.cos(tilt)),
        scale(around, Math.sin(tilt)),
      );
      // Branches near the tip are shorter; each is a little different in length
      const childLength =
        length *
        settings.branchLength *
        (0.75 + random() * 0.5) *
        (1 - 0.4 * along);
      grow(origin, childDirection, childLength, parentRadius * 0.7, level + 1);
    }
  };

  // The trunk starts at the origin and grows up
  grow([0, 0, 0], [0, 1, 0], settings.height, settings.trunkRadius, 0);
  return branches;
}

/** A mesh being built: points and triangles, added to a piece at a time. */
class MeshBuilder {
  positions: number[] = [];
  indices: number[] = [];
  point(p: Vec3): number {
    const id = this.positions.length / 3;
    this.positions.push(p[0], p[1], p[2]);
    return id;
  }
  triangle(a: number, b: number, c: number) {
    this.indices.push(a, b, c);
  }
  build(): ShapeMesh {
    return {
      positions: Float32Array.from(this.positions),
      indices: Uint32Array.from(this.indices),
    };
  }
}

/**
 * Adds a round tube along a branch: a ring of points at each point of the branch (turned to face along the
 * branch, carried along so it does not twist), joined with triangles, closed at the tip with a point and at
 * the base (for the trunk only) with a flat cap. Triangles wind counter-clockwise seen from outside.
 */
function addTube(
  mesh: MeshBuilder,
  branch: Branch,
  sides: number,
  capBase: boolean,
): void {
  const { points, radii } = branch;
  const count = points.length;
  const rings: number[][] = [];
  let normal: Vec3 | null = null;
  let tangent: Vec3 = [0, 1, 0];
  for (let i = 0; i < count; i++) {
    tangent = normalise(
      sub(points[Math.min(i + 1, count - 1)]!, points[Math.max(i - 1, 0)]!),
    );
    // Carry the previous ring's "side" direction along, kept at right angles to the new direction
    normal = normal
      ? normalise(sub(normal, scale(tangent, dot(normal, tangent))))
      : perpendicular(tangent);
    if (Math.abs(dot(normal, tangent)) > 0.99) normal = perpendicular(tangent);
    const binormal = cross(tangent, normal);
    const ring: number[] = [];
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const offset = add(
        scale(normal, Math.cos(angle)),
        scale(binormal, Math.sin(angle)),
      );
      ring.push(mesh.point(add(points[i]!, scale(offset, radii[i]!))));
    }
    rings.push(ring);
  }
  for (let i = 0; i < count - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = rings[i]![j]!;
      const b = rings[i]![(j + 1) % sides]!;
      const c = rings[i + 1]![j]!;
      const d = rings[i + 1]![(j + 1) % sides]!;
      mesh.triangle(a, b, d);
      mesh.triangle(a, d, c);
    }
  }
  // The tip: a point a little beyond the last ring
  const last = rings[count - 1]!;
  const apex = mesh.point(
    add(points[count - 1]!, scale(tangent, radii[count - 1]! * 1.5)),
  );
  for (let j = 0; j < sides; j++)
    mesh.triangle(last[j]!, last[(j + 1) % sides]!, apex);
  if (capBase) {
    const first = rings[0]!;
    const middle = mesh.point(points[0]!);
    for (let j = 0; j < sides; j++)
      mesh.triangle(first[(j + 1) % sides]!, first[j]!, middle);
  }
}

// An icosahedron (20 triangles): a rounded lump that looks faceted
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_POINTS: Vec3[] = (
  [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
  ] as Vec3[]
).map(normalise);
const ICO_FACES: [number, number, number][] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

/** Turns a point by random angles about all three axes (a random but repeatable turn). */
function randomTurn(random: () => number): (p: Vec3) => Vec3 {
  const [ax, ay, az] = [
    random() * Math.PI * 2,
    random() * Math.PI * 2,
    random() * Math.PI * 2,
  ];
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(ax),
    Math.sin(ax),
    Math.cos(ay),
    Math.sin(ay),
    Math.cos(az),
    Math.sin(az),
  ];
  return ([x, y, z]) => {
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;
    const x2 = x * cy + z1 * sy;
    const z2 = -x * sy + z1 * cy;
    return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
  };
}

/** A faceted lump of leaves, `size` across, at a spot, turned and squashed a little at random. */
function addBlob(
  mesh: MeshBuilder,
  center: Vec3,
  size: number,
  random: () => number,
): void {
  const turn = randomTurn(random);
  const squash = 0.75 + random() * 0.35;
  const ids = ICO_POINTS.map((p) => {
    const t = turn(p);
    return mesh.point(
      add(center, [
        t[0] * size * 0.5,
        t[1] * size * 0.5 * squash,
        t[2] * size * 0.5,
      ]),
    );
  });
  // The turn keeps the order of the corners (it is a turn, not a mirror), so the triangles still face outwards
  for (const [a, b, c] of ICO_FACES) mesh.triangle(ids[a]!, ids[b]!, ids[c]!);
}

/** Two flat leaves crossed like a plus sign, each drawn from both sides (the back has its own points so it lights correctly). */
function addCard(
  mesh: MeshBuilder,
  center: Vec3,
  size: number,
  random: () => number,
): void {
  const turn = randomTurn(random);
  const half = size / 2;
  for (const plane of [0, 1]) {
    const corners: Vec3[] = (
      plane === 0
        ? [
            [-half, -half, 0],
            [half, -half, 0],
            [half, half, 0],
            [-half, half, 0],
          ]
        : [
            [0, -half, -half],
            [0, -half, half],
            [0, half, half],
            [0, half, -half],
          ]
    ) as Vec3[];
    const placed = corners.map((c) => add(center, turn(c)));
    for (const side of [1, -1]) {
      const ids = placed.map((p) => mesh.point(p));
      if (side === 1) {
        mesh.triangle(ids[0]!, ids[1]!, ids[2]!);
        mesh.triangle(ids[0]!, ids[2]!, ids[3]!);
      } else {
        mesh.triangle(ids[0]!, ids[2]!, ids[1]!);
        mesh.triangle(ids[0]!, ids[3]!, ids[2]!);
      }
    }
  }
}

/**
 * Grows a plant from its settings: the wood (trunk and branches as tubes) and the leaves (lumps or cards
 * on the outer branches). The same settings always give the same plant. Pure: it returns two meshes and
 * touches nothing else. The leaves mesh has no points when there are no leaves (density 0).
 */
export function generatePlant(settings: PlantSettings): GrownPlant {
  const random = createRandom(settings.seed);
  const branches = growBranches(settings, random);

  const bark = new MeshBuilder();
  branches.forEach((branch, i) =>
    addTube(bark, branch, settings.sides, i === 0),
  );

  // Leaves grow on the last generation of branches (or on the trunk if there are none): one at the tip,
  // and more along the outer part, as many as the density asks for
  const leaves = new MeshBuilder();
  if (settings.leafDensity > 0) {
    const last = Math.min(
      settings.levels,
      Math.max(...branches.map((b) => b.level)),
    );
    for (const branch of branches) {
      if (branch.level !== last) continue;
      const along = Math.round(settings.leafDensity * 3) + 1;
      for (let k = 0; k < along; k++) {
        // The tip first, then points further back along the branch
        const index =
          branch.points.length - 1 - Math.min(k, branch.points.length - 1);
        const jitter: Vec3 = [
          (random() - 0.5) * settings.leafSize * 0.6,
          (random() - 0.2) * settings.leafSize * 0.6,
          (random() - 0.5) * settings.leafSize * 0.6,
        ];
        const size = settings.leafSize * (0.7 + random() * 0.6);
        const spot = add(branch.points[index]!, jitter);
        if (settings.leafStyle === "cards")
          addCard(leaves, spot, size * 1.6, random);
        else addBlob(leaves, spot, size, random);
      }
    }
  }
  return { bark: bark.build(), leaves: leaves.build() };
}

// ---- Scattering copies (a forest from one tree) ----

/** Where and how one copy of a plant stands: a spot on the ground, a turn about up, a size, and its own seed. */
export type Scatter = {
  x: number;
  z: number;
  turn: number;
  size: number;
  seed: number;
};

/**
 * Chooses spots for `count` copies inside a circle of `radius` around the middle, no two closer than
 * `spacing`, by throwing darts and keeping the ones that land far enough from the others. When the circle
 * is too crowded to fit them all, fewer are returned. The same arguments always give the same result.
 * Each copy also gets a random turn, a size between 1 - `sizeVariation` and 1 + `sizeVariation`, and a
 * seed of its own (so the copies differ in shape too).
 */
export function scatterSpots(options: {
  seed: number;
  count: number;
  radius: number;
  spacing: number;
  sizeVariation: number;
  firstSeed: number;
}): Scatter[] {
  const random = createRandom(options.seed);
  const spots: Scatter[] = [];
  const attempts = options.count * 30 + 30;
  for (let i = 0; i < attempts && spots.length < options.count; i++) {
    // A uniform spot in the circle (the square root keeps the spread even)
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * options.radius;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < options.spacing))
      continue;
    spots.push({
      x,
      z,
      turn: random() * Math.PI * 2,
      size: 1 + (random() * 2 - 1) * options.sizeVariation,
      seed: (options.firstSeed + spots.length * 7919 + 1) % 100000,
    });
  }
  return spots;
}

/**
 * Adds copies of a plant object around it, as a forest: each copy has its own spot, turn, size and seed (so
 * it grows a little differently), keeps the other settings, and goes in the same parent as the original.
 * The ids come from `generateId`. Returns the new scene and the ids of the copies.
 */
export function scatterPlants(
  scene: Scene,
  nodeId: string,
  spots: readonly Scatter[],
  generateId: () => string,
): { scene: Scene; ids: string[] } {
  const original = scene.nodes[nodeId];
  if (!original?.plant) throw new Error(`Node "${nodeId}" is not a plant`);
  let next = scene;
  const ids: string[] = [];
  for (const spot of spots) {
    const id = generateId();
    const { position, scale: size } = original.transform;
    next = addNode(next, {
      ...original,
      id,
      name: availableName(next, original.name),
      transform: {
        position: [position[0] + spot.x, position[1], position[2] + spot.z],
        rotation: [
          original.transform.rotation[0],
          spot.turn,
          original.transform.rotation[2],
        ],
        scale: [size[0] * spot.size, size[1] * spot.size, size[2] * spot.size],
      },
      plant: { ...original.plant, seed: spot.seed },
    });
    ids.push(id);
  }
  return { scene: next, ids };
}

/** The settings of a plant for a seed: the starting numbers with only the seed changed (used by "randomise"). */
export function plantWithSeed(
  plant: PlantSettings,
  seed: number,
): PlantSettings {
  return { ...plant, seed: Math.min(99999, Math.max(0, Math.round(seed))) };
}

// ---- Varying a plant ----

/**
 * How each number is varied. "scale" multiplies it by 1 plus or minus the amount (good for sizes, which
 * differ a lot between plants); "shift" adds or subtracts the amount times the given size (good for values
 * that can be 0 or negative). Settings left out (levels, sides, rings, the leaf style and colour) are kept:
 * they change how heavy or how styled the plant is, not just its shape.
 */
const VARIATION: Record<
  string,
  { mode: "scale" } | { mode: "shift"; size: number }
> = {
  height: { mode: "scale" },
  trunkRadius: { mode: "scale" },
  taper: { mode: "shift", size: 0.5 },
  crookedness: { mode: "shift", size: 0.5 },
  branches: { mode: "shift", size: 6 },
  branchAngle: { mode: "scale" },
  branchLength: { mode: "scale" },
  branchStart: { mode: "shift", size: 0.5 },
  droop: { mode: "shift", size: 1 },
  leafDensity: { mode: "shift", size: 0.6 },
  leafSize: { mode: "scale" },
};

/**
 * A variation of a plant: every shape number moves a random amount (`amount` is how far, 0.25 = up to a
 * quarter), kept inside its allowed range, and the seed is new. The kind of plant stays recognisable (a
 * pine stays tall and droopy), but it is a different plant. The same random stream always gives the same
 * variation. Returns only what changed, ready for `setNodePlant`.
 *
 * Pressing it again on its own result would wander: each variation is centred on the plant it starts from,
 * so a chain of them is a random walk. `createPlantRandomiser` avoids that.
 */
export function varyPlant(
  plant: PlantSettings,
  random: () => number,
  amount = 0.25,
): PlantChange {
  const change: Record<string, number> = {};
  for (const [key, rule] of Object.entries(VARIATION)) {
    const current = plant[key as keyof PlantSettings] as number;
    const step = (random() * 2 - 1) * amount;
    // A size is multiplied by a factor that is as likely to be "bigger by a quarter" as "smaller by a quarter"
    // (1.25 or 0.8), not by 1 + or - a quarter: those do not cancel out (1.25 x 0.75 is less than 1), so
    // plants would shrink bit by bit
    change[key] =
      rule.mode === "scale"
        ? current * (amount > 0 ? Math.pow(1 + amount, step / amount) : 1)
        : current + step * rule.size;
  }
  change["seed"] = Math.floor(random() * 100000);
  return sanitizePlantChange(change as PlantChange);
}

/** True if two plants have exactly the same settings. */
export function samePlant(a: PlantSettings, b: PlantSettings): boolean {
  return (Object.keys(a) as (keyof PlantSettings)[]).every(
    (key) => a[key] === b[key],
  );
}

/**
 * The Randomise button's memory. Every press varies around the SAME plant (the one you started from), not
 * around the last result, so pressing it many times gives many variations of one plant and nothing drifts
 * (a chain of variations would slowly wander, and clamping at the ends makes plants pile up at the minimum).
 * A new starting plant is taken as soon as the plant is not what the last press made: you moved a slider,
 * chose a kind, or used Undo.
 */
export function createPlantRandomiser(): (
  current: PlantSettings,
  random: () => number,
  amount?: number,
) => PlantChange {
  let anchor: PlantSettings | null = null;
  let produced: PlantSettings | null = null;
  return (current, random, amount) => {
    if (!anchor || !produced || !samePlant(current, produced)) anchor = current;
    const change = varyPlant(anchor, random, amount);
    produced = { ...anchor, ...change };
    return change;
  };
}

// ---- Plants a person saved ("my plants") ----

/** Most plants a person can save, and the longest name. */
export const MAX_CUSTOM_PLANTS = 24;
export const CUSTOM_PLANT_NAME_MAX_LENGTH = 40;

/** A plant a person saved: a name, the trunk colour and all the numbers except the seed (a new plant gets its own). */
export const customPlantSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(CUSTOM_PLANT_NAME_MAX_LENGTH),
  barkColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  plant: plantSchema.omit({ seed: true }),
});

export type CustomPlant = z.infer<typeof customPlantSchema>;

/** Makes a saved plant from an object's settings. Throws for an object that is not a plant or has no usable name. */
export function customPlantFrom(
  id: string,
  name: string,
  node: SceneNode,
): CustomPlant {
  if (!node.plant) throw new Error(`Node "${node.id}" is not a plant`);
  const { seed, ...numbers } = node.plant;
  void seed;
  return customPlantSchema.parse({
    id,
    name: name.trim().slice(0, CUSTOM_PLANT_NAME_MAX_LENGTH),
    barkColor: node.color,
    plant: numbers,
  });
}

/**
 * Adds a saved plant to the list. A plant with the same name (ignoring capitals) is REPLACED, so saving
 * again after tuning updates it instead of piling up copies; the list never grows past `MAX_CUSTOM_PLANTS`
 * (the oldest are dropped). Does not change the list it was given.
 */
export function addCustomPlant(
  list: readonly CustomPlant[],
  item: CustomPlant,
): CustomPlant[] {
  const same = (other: CustomPlant) =>
    other.name.toLowerCase() === item.name.toLowerCase();
  const kept = list.filter((other) => !same(other));
  return [...kept, item].slice(-MAX_CUSTOM_PLANTS);
}

/** The list without the plant with this id. */
export function removeCustomPlant(
  list: readonly CustomPlant[],
  id: string,
): CustomPlant[] {
  return list.filter((item) => item.id !== id);
}

/**
 * Reads a list of saved plants from storage. The data lives in the browser, so it may be damaged or from
 * another version: items that are not valid are dropped (the rest are kept), nothing else is trusted, and
 * a list that is not a list gives an empty one. Duplicate ids keep the first.
 */
export function parseCustomPlants(raw: unknown): CustomPlant[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const items: CustomPlant[] = [];
  for (const entry of raw) {
    const result = customPlantSchema.safeParse(entry);
    if (!result.success || seen.has(result.data.id)) continue;
    seen.add(result.data.id);
    items.push(result.data);
    if (items.length >= MAX_CUSTOM_PLANTS) break;
  }
  return items;
}

/** A new plant object from a saved plant: at the middle of the scene, with the given seed. */
export function createPlantNodeFrom(
  id: string,
  item: CustomPlant,
  seed: number,
): SceneNode {
  const base = createPlantNode(id, "tree", seed);
  return {
    ...base,
    name: item.name,
    color: item.barkColor,
    plant: { ...item.plant, seed },
  };
}
