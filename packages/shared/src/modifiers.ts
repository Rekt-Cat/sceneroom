import type {
  Modifier,
  ModifierAxis,
  ModifierType,
  Scene,
  SceneNode,
} from "./scene";
import {
  MAX_ARRAY_COUNT,
  MAX_ARRAY_SPACING,
  MAX_MIRROR_OFFSET,
  MAX_MODIFIERS,
  MAX_SEGMENTS,
  MAX_STRETCH,
  MIN_ARRAY_COUNT,
  MIN_STRETCH,
  PRIMITIVE_KINDS,
} from "./scene";

/** The kinds of modifier, in the order the "Add modifier" buttons show them. */
export const MODIFIER_TYPES: readonly ModifierType[] = [
  "bend",
  "twist",
  "taper",
  "stretch",
  "noise",
  "mirror",
  "array",
];

/** What a modifier is called and what it does, for the buttons and the cards. */
export const MODIFIER_INFO: Record<
  ModifierType,
  { label: string; hint: string }
> = {
  bend: { label: "Bend", hint: "Curve the shape around an arc" },
  twist: {
    label: "Twist",
    hint: "Turn each slice a bit more than the one before",
  },
  taper: { label: "Taper", hint: "Make one end thinner or wider" },
  stretch: { label: "Stretch", hint: "Make the shape longer or shorter" },
  noise: { label: "Noise", hint: "Make the surface bumpy and organic" },
  mirror: { label: "Mirror", hint: "Add a reflected copy on the other side" },
  array: { label: "Array", hint: "Repeat the shape in a line" },
};

/** The kinds of modifier that work along an axis (noise does not: it pushes points in all directions). */
export function usesAxis(type: ModifierType): boolean {
  return type !== "noise";
}

/** True for objects whose shape modifiers can change: the built-in shapes (not models, not lights). */
export function supportsModifiers(node: SceneNode): boolean {
  return (PRIMITIVE_KINDS as readonly string[]).includes(node.kind);
}

/** A new modifier of a kind, with its starting values. */
export function createModifier(id: string, type: ModifierType): Modifier {
  switch (type) {
    case "bend":
      return { id, type, enabled: true, axis: "y", angle: 45 };
    case "twist":
      return { id, type, enabled: true, axis: "y", angle: 90 };
    case "taper":
      return { id, type, enabled: true, axis: "y", amount: 0.5 };
    case "stretch":
      return {
        id,
        type,
        enabled: true,
        axis: "y",
        factor: 1.5,
        keepVolume: false,
      };
    case "noise":
      return {
        id,
        type,
        enabled: true,
        axis: "y",
        strength: 0.1,
        scale: 2,
        seed: 1,
      };
    case "mirror":
      return { id, type, enabled: true, axis: "x", offset: 0.5 };
    case "array":
      return { id, type, enabled: true, axis: "x", count: 3, spacing: 1.2 };
  }
}

/** A change to a modifier's settings (which ones apply depends on its type). */
export type ModifierChange = {
  enabled?: boolean;
  axis?: ModifierAxis;
  angle?: number;
  amount?: number;
  factor?: number;
  keepVolume?: boolean;
  strength?: number;
  scale?: number;
  seed?: number;
  count?: number;
  spacing?: number;
  offset?: number;
};

/** The number settings of each kind: [smallest, largest, whole numbers only?]. */
const NUMBER_SETTINGS: Record<
  ModifierType,
  Record<string, [number, number, boolean]>
> = {
  bend: { angle: [-360, 360, false] },
  twist: { angle: [-720, 720, false] },
  taper: { amount: [-1, 1, false] },
  stretch: { factor: [MIN_STRETCH, MAX_STRETCH, false] },
  noise: {
    strength: [0, 1, false],
    scale: [0.1, 10, false],
    seed: [0, 9999, true],
  },
  mirror: { offset: [-MAX_MIRROR_OFFSET, MAX_MIRROR_OFFSET, false] },
  array: {
    count: [MIN_ARRAY_COUNT, MAX_ARRAY_COUNT, true],
    spacing: [0, MAX_ARRAY_SPACING, false],
  },
};

/**
 * Cleans up a change for a modifier: numbers that are not finite are dropped and the rest are kept
 * inside the range of that kind of modifier (whole numbers where that is needed); the axis must be x, y
 * or z; the switches must be true or false. A setting that does not belong to the kind (an angle for a
 * taper) is dropped.
 */
export function sanitizeModifierChange(
  modifier: Modifier,
  change: ModifierChange,
): ModifierChange {
  const clean: Record<string, unknown> = {};
  if (typeof change.enabled === "boolean") clean["enabled"] = change.enabled;
  if (
    usesAxis(modifier.type) &&
    (change.axis === "x" || change.axis === "y" || change.axis === "z")
  ) {
    clean["axis"] = change.axis;
  }
  if (modifier.type === "stretch" && typeof change.keepVolume === "boolean") {
    clean["keepVolume"] = change.keepVolume;
  }
  const settings = NUMBER_SETTINGS[modifier.type];
  for (const [key, [min, max, whole]] of Object.entries(settings)) {
    const value = (change as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const limited = Math.min(max, Math.max(min, value));
    clean[key] = whole ? Math.round(limited) : limited;
  }
  return clean as ModifierChange;
}

/** True if applying the (cleaned) change would alter the modifier. */
export function modifierChangeDiffers(
  modifier: Modifier,
  change: ModifierChange,
): boolean {
  const current = modifier as unknown as Record<string, unknown>;
  return Object.entries(change).some(
    ([key, value]) => value !== undefined && current[key] !== value,
  );
}

function withNode(
  scene: Scene,
  nodeId: string,
  change: (node: SceneNode) => SceneNode,
): Scene {
  const node = scene.nodes[nodeId];
  if (!node) throw new Error(`Node "${nodeId}" does not exist`);
  return { ...scene, nodes: { ...scene.nodes, [nodeId]: change(node) } };
}

/** Adds a modifier at the end of an object's list. Throws for an object that cannot have modifiers or a full list. */
export function addModifier(
  scene: Scene,
  nodeId: string,
  modifier: Modifier,
): Scene {
  return withNode(scene, nodeId, (node) => {
    if (!supportsModifiers(node)) {
      throw new Error(`Node "${nodeId}" cannot have modifiers`);
    }
    if (node.modifiers.length >= MAX_MODIFIERS) {
      throw new Error(`An object can have at most ${MAX_MODIFIERS} modifiers`);
    }
    return { ...node, modifiers: [...node.modifiers, modifier] };
  });
}

/** Removes a modifier. The same scene if the object has no such modifier. */
export function removeModifier(
  scene: Scene,
  nodeId: string,
  modifierId: string,
): Scene {
  const node = scene.nodes[nodeId];
  if (!node?.modifiers.some((m) => m.id === modifierId)) return scene;
  return withNode(scene, nodeId, (n) => ({
    ...n,
    modifiers: n.modifiers.filter((m) => m.id !== modifierId),
  }));
}

/** Changes some settings of one modifier, keeping the others. */
export function setModifier(
  scene: Scene,
  nodeId: string,
  modifierId: string,
  change: ModifierChange,
): Scene {
  return withNode(scene, nodeId, (node) => ({
    ...node,
    modifiers: node.modifiers.map((m) =>
      m.id === modifierId ? ({ ...m, ...change } as Modifier) : m,
    ),
  }));
}

/**
 * Copies a modifier (with the new id given) and puts the copy right after the original, so a second bend
 * along another axis is one click away. Same scene if the original does not exist or the list is full.
 */
export function duplicateModifier(
  scene: Scene,
  nodeId: string,
  modifierId: string,
  newId: string,
): Scene {
  const node = scene.nodes[nodeId];
  const index = node?.modifiers.findIndex((m) => m.id === modifierId) ?? -1;
  if (!node || index < 0 || node.modifiers.length >= MAX_MODIFIERS) {
    return scene;
  }
  const list = [...node.modifiers];
  list.splice(index + 1, 0, { ...node.modifiers[index]!, id: newId });
  return withNode(scene, nodeId, (n) => ({ ...n, modifiers: list }));
}

/** Moves a modifier one place earlier or later in the list (the order matters: bend then twist differs from twist then bend). */
export function moveModifier(
  scene: Scene,
  nodeId: string,
  modifierId: string,
  direction: "up" | "down",
): Scene {
  const node = scene.nodes[nodeId];
  const from = node?.modifiers.findIndex((m) => m.id === modifierId) ?? -1;
  const to = direction === "up" ? from - 1 : from + 1;
  if (!node || from < 0 || to < 0 || to >= node.modifiers.length) return scene;
  const list = [...node.modifiers];
  [list[from], list[to]] = [list[to]!, list[from]!];
  return withNode(scene, nodeId, (n) => ({ ...n, modifiers: list }));
}

/** Sets how finely the shape is cut up, kept between 1 and the most allowed. The same scene if nothing changes. */
export function setSegments(
  scene: Scene,
  nodeId: string,
  segments: number,
): Scene {
  const node = scene.nodes[nodeId];
  if (!node || !Number.isFinite(segments)) return scene;
  const next = Math.min(MAX_SEGMENTS, Math.max(1, Math.round(segments)));
  if (next === node.segments) return scene;
  return withNode(scene, nodeId, (n) => ({ ...n, segments: next }));
}

/** How an axis is named for people: the letter, and what it means in the scene (y is up). */
export const AXIS_NAMES: Record<ModifierAxis, string> = {
  x: "X (sideways)",
  y: "Y (up)",
  z: "Z (forward)",
};

/** The direction after this one in the order x, y, z, x (a bend curves towards it). */
export function nextAxis(axis: ModifierAxis): ModifierAxis {
  return axis === "x" ? "y" : axis === "y" ? "z" : "x";
}

/** A plain sentence saying what a modifier does to the shape, for the card in the Inspector. */
export function describeModifier(modifier: Modifier): string {
  const axis = AXIS_NAMES[modifier.axis];
  switch (modifier.type) {
    case "bend":
      return `Bends along ${axis}, curving towards ${AXIS_NAMES[nextAxis(modifier.axis)]}.`;
    case "twist":
      return `Twists around ${axis}: one end turns against the other.`;
    case "taper":
      return modifier.amount >= 0
        ? `Makes the far end along ${axis} thinner.`
        : `Makes the far end along ${axis} wider.`;
    case "stretch":
      return modifier.factor >= 1
        ? `Makes the shape longer along ${axis}.`
        : `Squashes the shape shorter along ${axis}.`;
    case "noise":
      return "Pushes points around in a smooth, bumpy pattern. Another seed gives another pattern.";
    case "mirror":
      return `Adds a flipped copy across a plane on ${axis}. Offset 0 puts the plane through the middle of the object; 0.5 puts it at the side of the shape.`;
    case "array":
      return `Repeats the shape ${modifier.count} times along ${axis}.`;
  }
}

// ---- The deformation itself: pure maths on points and triangles ----

/**
 * A shape as the modifiers see it: its points (x, y, z, x, y, z, ...) and its triangles (three point
 * numbers each). Modifiers that only move points keep the triangles; mirror and array add more of both.
 */
export type ShapeMesh = { positions: Float32Array; indices: Uint32Array };

/** The most points a shape may have after its modifiers; a modifier that would go past this is skipped. */
export const MAX_DEFORMED_POINTS = 400_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const AXIS_INDEX: Record<ModifierAxis, number> = { x: 0, y: 1, z: 2 };
const EPSILON = 1e-9;

/** Smallest and largest value of one coordinate (0 = x, 1 = y, 2 = z) over all the points. */
function range(
  points: Float32Array,
  index: number,
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = index; i < points.length; i += 3) {
    const value = points[i]!;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/**
 * Applies the enabled modifiers, in order, to a shape and returns the new shape; the input is not
 * changed. Each modifier measures the shape as it is when its turn comes, so the order matters. Points
 * are in the object's own space.
 *
 * For an axis, "along" is that direction and "across" are the other two (next, then the one after, going
 * x, y, z, x, ...). Bend curves towards the next direction.
 */
export function deformMesh(
  mesh: ShapeMesh,
  modifiers: readonly Modifier[],
): ShapeMesh {
  let current = mesh;
  for (const modifier of modifiers) {
    if (!modifier.enabled) continue;
    current = applyModifier(current, modifier);
  }
  return current === mesh
    ? {
        positions: new Float32Array(mesh.positions),
        indices: new Uint32Array(mesh.indices),
      }
    : current;
}

/** Like `deformMesh` for a list of points with no triangles (only for modifiers that move points). */
export function deformPoints(
  points: Float32Array,
  modifiers: readonly Modifier[],
): Float32Array {
  return deformMesh(
    { positions: points, indices: new Uint32Array(0) },
    modifiers,
  ).positions;
}

function applyModifier(mesh: ShapeMesh, modifier: Modifier): ShapeMesh {
  switch (modifier.type) {
    case "mirror":
      return mirror(mesh, AXIS_INDEX[modifier.axis], modifier.offset);
    case "array":
      return array(
        mesh,
        AXIS_INDEX[modifier.axis],
        modifier.count,
        modifier.spacing,
      );
    default:
      return {
        positions: movePoints(mesh.positions, modifier),
        indices: mesh.indices,
      };
  }
}

/**
 * Reflects the shape across a plane on one axis and adds the reflection as a second shell. The plane
 * stands `offset` shape-lengths from the middle of the object (the origin).
 */
function mirror(mesh: ShapeMesh, along: number, offset: number): ShapeMesh {
  const count = mesh.positions.length / 3;
  if (count * 2 > MAX_DEFORMED_POINTS) return mesh;
  const { min, max } = range(mesh.positions, along);
  const plane = offset * (max - min);
  const positions = new Float32Array(mesh.positions.length * 2);
  positions.set(mesh.positions);
  positions.set(mesh.positions, mesh.positions.length);
  for (let i = mesh.positions.length + along; i < positions.length; i += 3) {
    // "+ 0" turns a negative zero into a plain zero
    positions[i] = 2 * plane - positions[i]! + 0;
  }
  const indices = new Uint32Array(mesh.indices.length * 2);
  indices.set(mesh.indices);
  // A reflection turns the shape inside out, so the order of each triangle's corners is reversed
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const at = mesh.indices.length + t;
    indices[at] = mesh.indices[t]! + count;
    indices[at + 1] = mesh.indices[t + 2]! + count;
    indices[at + 2] = mesh.indices[t + 1]! + count;
  }
  return { positions, indices };
}

/** Repeats the shape `copies` times along one axis, `spacing` shape-lengths apart (1 = touching). */
function array(
  mesh: ShapeMesh,
  along: number,
  copies: number,
  spacing: number,
): ShapeMesh {
  const count = mesh.positions.length / 3;
  if (count * copies > MAX_DEFORMED_POINTS) return mesh;
  const { min, max } = range(mesh.positions, along);
  const step = (max - min) * spacing;
  const positions = new Float32Array(mesh.positions.length * copies);
  const indices = new Uint32Array(mesh.indices.length * copies);
  for (let k = 0; k < copies; k++) {
    const pointStart = k * mesh.positions.length;
    positions.set(mesh.positions, pointStart);
    for (
      let i = pointStart + along;
      i < pointStart + mesh.positions.length;
      i += 3
    ) {
      positions[i] = positions[i]! + k * step;
    }
    for (let t = 0; t < mesh.indices.length; t++) {
      indices[k * mesh.indices.length + t] = mesh.indices[t]! + k * count;
    }
  }
  return { positions, indices };
}

/** The modifiers that only move the points. */
function movePoints(points: Float32Array, modifier: Modifier): Float32Array {
  if (modifier.type === "noise") return noise(points, modifier);
  const along = AXIS_INDEX[modifier.axis];
  const first = (along + 1) % 3;
  const second = (along + 2) % 3;
  const { min, max } = range(points, along);
  const length = max - min;
  // A shape with no length along the axis (a plane seen edge-on) cannot be bent, twisted, tapered or stretched
  if (!(length > EPSILON)) return points;
  const middle = (min + max) / 2;
  const result = new Float32Array(points);

  for (let i = 0; i < points.length; i += 3) {
    const a = points[i + along]!;
    const u = points[i + first]!;
    const v = points[i + second]!;
    switch (modifier.type) {
      case "twist": {
        const turn = toRadians(modifier.angle) * ((a - middle) / length);
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        result[i + first] = u * cos - v * sin;
        result[i + second] = u * sin + v * cos;
        break;
      }
      case "taper": {
        const scale = 1 - modifier.amount * ((a - min) / length);
        result[i + first] = u * scale;
        result[i + second] = v * scale;
        break;
      }
      case "bend": {
        const angle = toRadians(modifier.angle);
        if (Math.abs(angle) < 1e-6) break;
        // The shape is laid along an arc: k is how much it turns per unit of length, r the radius
        const k = angle / length;
        const r = 1 / k;
        const phi = k * (a - middle);
        // `u` (the next direction) is the side the arc curves towards
        result[i + along] = middle + (r - u) * Math.sin(phi);
        result[i + first] = r - (r - u) * Math.cos(phi);
        break;
      }
      case "stretch": {
        result[i + along] = middle + (a - middle) * modifier.factor;
        if (modifier.keepVolume) {
          // Longer means thinner, so the volume stays about the same
          const across = 1 / Math.sqrt(modifier.factor);
          result[i + first] = u * across;
          result[i + second] = v * across;
        }
        break;
      }
    }
  }
  return result;
}

// ---- Noise: a smooth pattern that depends only on where a point is ----

/** A repeatable random number from -1 to 1 for a whole-number spot in space. */
function hash(ix: number, iy: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
  h ^= Math.imul(iz, 2147483647) ^ Math.imul(seed + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth "value noise": random numbers at the corners of a grid, blended in between. -1 to 1. */
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) =>
    hash(ix + dx, iy + dy, iz + dz, seed);
  return lerp(
    lerp(
      lerp(corner(0, 0, 0), corner(1, 0, 0), fx),
      lerp(corner(0, 1, 0), corner(1, 1, 0), fx),
      fy,
    ),
    lerp(
      lerp(corner(0, 0, 1), corner(1, 0, 1), fx),
      lerp(corner(0, 1, 1), corner(1, 1, 1), fx),
      fy,
    ),
    fz,
  );
}

/**
 * Pushes every point by a smooth, repeatable amount. The push depends only on where the point is, so
 * points that sit on the same spot (the corners of a cube, the seam of a cylinder) move together and no
 * gaps open. `strength` is a fraction of the size of the shape; `scale` is how many bumps fit across it.
 */
function noise(
  points: Float32Array,
  modifier: Extract<Modifier, { type: "noise" }>,
): Float32Array {
  const [x0, x1] = [range(points, 0), range(points, 1)];
  const z0 = range(points, 2);
  const size = Math.max(x0.max - x0.min, x1.max - x1.min, z0.max - z0.min);
  if (!(size > EPSILON) || modifier.strength === 0) return points;
  const result = new Float32Array(points);
  const push = modifier.strength * size;
  for (let i = 0; i < points.length; i += 3) {
    const qx = ((points[i]! - x0.min) / size) * modifier.scale;
    const qy = ((points[i + 1]! - x1.min) / size) * modifier.scale;
    const qz = ((points[i + 2]! - z0.min) / size) * modifier.scale;
    // A different corner of the grid for each direction, so the three pushes are not the same
    result[i] = points[i]! + valueNoise(qx, qy, qz, modifier.seed) * push;
    result[i + 1] =
      points[i + 1]! +
      valueNoise(qx + 31.7, qy + 17.3, qz + 5.9, modifier.seed) * push;
    result[i + 2] =
      points[i + 2]! +
      valueNoise(qx + 11.1, qy + 47.9, qz + 23.5, modifier.seed) * push;
  }
  return result;
}
