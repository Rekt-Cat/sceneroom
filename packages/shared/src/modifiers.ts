import type {
  Modifier,
  ModifierAxis,
  ModifierType,
  Scene,
  SceneNode,
} from "./scene";
import { MAX_MODIFIERS, MAX_SEGMENTS, PRIMITIVE_KINDS } from "./scene";

/** The kinds of modifier, in the order the "Add modifier" buttons show them. */
export const MODIFIER_TYPES: readonly ModifierType[] = [
  "bend",
  "twist",
  "taper",
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
};

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
  }
}

/** A change to a modifier's settings (which ones apply depends on its type). */
export type ModifierChange = {
  enabled?: boolean;
  axis?: ModifierAxis;
  angle?: number;
  amount?: number;
};

const ANGLE_LIMIT: Record<ModifierType, number> = {
  bend: 360,
  twist: 720,
  taper: 0,
};

/**
 * Cleans up a change for a modifier: numbers that are not finite are dropped and the rest are kept
 * inside the range of that kind of modifier; the axis must be x, y or z; "enabled" true or false. A
 * setting that does not belong to the kind (an angle for a taper) is dropped.
 */
export function sanitizeModifierChange(
  modifier: Modifier,
  change: ModifierChange,
): ModifierChange {
  const clean: ModifierChange = {};
  if (typeof change.enabled === "boolean") clean.enabled = change.enabled;
  if (change.axis === "x" || change.axis === "y" || change.axis === "z") {
    clean.axis = change.axis;
  }
  if (modifier.type !== "taper") {
    const limit = ANGLE_LIMIT[modifier.type];
    if (typeof change.angle === "number" && Number.isFinite(change.angle)) {
      clean.angle = Math.min(limit, Math.max(-limit, change.angle));
    }
  } else if (
    typeof change.amount === "number" &&
    Number.isFinite(change.amount)
  ) {
    clean.amount = Math.min(1, Math.max(-1, change.amount));
  }
  return clean;
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
  if (!node || index < 0 || node.modifiers.length >= MAX_MODIFIERS)
    return scene;
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
  }
}

// ---- The deformation itself: pure maths on a list of points ----

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
 * Applies the enabled modifiers, in order, to a list of points (x, y, z, x, y, z, ...) and returns the
 * new list; the input is not changed. Each modifier measures the shape as it is when its turn comes, so
 * the order matters. Points are in the object's own space.
 *
 * For an axis, "along" is that direction and "across" are the other two (next, then the one after, going
 * x, y, z, x, ...). Bend curves towards the next direction.
 */
export function deformPoints(
  points: Float32Array,
  modifiers: readonly Modifier[],
): Float32Array {
  let current = points;
  for (const modifier of modifiers) {
    if (!modifier.enabled) continue;
    current = applyModifier(current, modifier);
  }
  return current === points ? new Float32Array(points) : current;
}

function applyModifier(points: Float32Array, modifier: Modifier): Float32Array {
  const along = AXIS_INDEX[modifier.axis];
  const first = (along + 1) % 3;
  const second = (along + 2) % 3;
  const { min, max } = range(points, along);
  const length = max - min;
  // A shape with no length along the axis (a plane seen edge-on) cannot be bent, twisted or tapered
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
    }
  }
  return result;
}
