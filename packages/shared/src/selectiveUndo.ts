import { removeNodes } from "./sceneOps";
import type { Scene, SceneNode } from "./scene";

/**
 * Undo and Redo for a scene that other people change too (docs/backend/COLLABORATION.md, section 8).
 *
 * The editor's normal Undo puts back a whole earlier scene. Online that would also undo what other people did in
 * between. Here an undo step is the scene `before` a change and the scene `after` it, and Undo takes back only what
 * THAT change did: field by field, a field goes back only if it still has the value the change gave it. If someone
 * else has changed the same field since, theirs wins and that field is left alone.
 *
 * Pure functions: they return a new scene (or the very same one if nothing could be applied).
 */
export type UndoStepScenes = { before: Scene; after: Scene };

export type SelectiveResult = {
  scene: Scene;
  /** How many changes (an object added or removed, or one field) were applied. */
  applied: number;
  /** How many were left alone because someone else had changed the same thing since. */
  skipped: number;
};

/** Takes back the change: what it set goes back to what it was, wherever nobody else has touched it since. */
export function undoOwnChange(
  current: Scene,
  step: UndoStepScenes,
): SelectiveResult {
  return carryOver(current, step.after, step.before);
}

/** Puts the change back after an Undo, wherever nobody else has touched it since. */
export function redoOwnChange(
  current: Scene,
  step: UndoStepScenes,
): SelectiveResult {
  return carryOver(current, step.before, step.after);
}

type Plain = Record<string, unknown>;

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) =>
      Object.hasOwn(b, key) && same((a as Plain)[key], (b as Plain)[key]),
  );
}

/** Nested records of an object whose fields are changed one by one. */
const NESTED = ["transform", "material"] as const;

/**
 * Moves `current` along the change from `from` to `to`: every difference between the two is applied to `current`,
 * but only where `current` still equals `from` at that place.
 */
function carryOver(current: Scene, from: Scene, to: Scene): SelectiveResult {
  let applied = 0;
  let skipped = 0;
  let nodes = current.nodes;

  const ids = new Set([...Object.keys(from.nodes), ...Object.keys(to.nodes)]);
  for (const id of ids) {
    const was = from.nodes[id];
    const now = to.nodes[id];
    const there = nodes[id];
    if (was && !now) {
      // The change removes this object
      if (there) {
        nodes = removeNodes({ ...current, nodes }, [id]).nodes;
        applied += 1;
      }
    } else if (!was && now) {
      // The change brings this object back (or makes it)
      if (there) {
        skipped += 1;
      } else {
        const parentMissing = now.parentId !== null && !(now.parentId in nodes);
        nodes = {
          ...nodes,
          [id]: parentMissing ? { ...now, parentId: null } : now,
        };
        applied += 1;
      }
    } else if (was && now && !same(was, now)) {
      if (!there) {
        skipped += 1;
        continue;
      }
      const result = carryOverNode(nodes, id, there, was, now);
      nodes = result.nodes;
      applied += result.applied;
      skipped += result.skipped;
    }
  }

  // Files are add-only online, so a file a step used is kept in the scene's list whichever way it goes
  let assets = current.assets;
  for (const source of [from.assets, to.assets]) {
    for (const [id, info] of Object.entries(source)) {
      if (!(id in assets)) assets = { ...assets, [id]: info };
    }
  }

  let environment = current.environment;
  for (const key of Object.keys(
    to.environment,
  ) as (keyof Scene["environment"])[]) {
    if (same(from.environment[key], to.environment[key])) continue;
    if (same(environment[key], from.environment[key])) {
      environment = { ...environment, [key]: to.environment[key] };
      applied += 1;
    } else {
      skipped += 1;
    }
  }

  if (applied === 0 && assets === current.assets) {
    return { scene: current, applied: 0, skipped };
  }
  return {
    scene: { ...current, nodes, assets, environment },
    applied,
    skipped,
  };
}

/** Would making `parentId` the parent of `id` make a loop (an object inside itself)? */
function makesLoop(
  nodes: Scene["nodes"],
  id: string,
  parentId: string | null,
): boolean {
  for (
    let walk = parentId, guard = 0;
    walk !== null && guard <= Object.keys(nodes).length;
    walk = nodes[walk]?.parentId ?? null, guard++
  ) {
    if (walk === id) return true;
  }
  return false;
}

function carryOverNode(
  nodes: Scene["nodes"],
  id: string,
  current: SceneNode,
  from: SceneNode,
  to: SceneNode,
): { nodes: Scene["nodes"]; applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;
  const next: Plain = { ...current };

  const apply = (
    target: Plain,
    now: Plain,
    was: Plain,
    goal: Plain,
    key: string,
  ): void => {
    if (same(was[key], goal[key])) return;
    if (!same(now[key], was[key])) {
      skipped += 1;
      return;
    }
    if (
      key === "parentId" &&
      makesLoop(nodes, id, goal[key] as string | null)
    ) {
      skipped += 1;
      return;
    }
    target[key] = goal[key];
    applied += 1;
  };

  const f = from as unknown as Plain;
  const t = to as unknown as Plain;
  const c = current as unknown as Plain;
  for (const key of new Set([...Object.keys(f), ...Object.keys(t)])) {
    if (key === "id") continue;
    if ((NESTED as readonly string[]).includes(key)) {
      const nested: Plain = { ...(c[key] as Plain) };
      const fromNested = f[key] as Plain;
      const toNested = t[key] as Plain;
      for (const sub of new Set([
        ...Object.keys(fromNested),
        ...Object.keys(toNested),
      ])) {
        apply(nested, c[key] as Plain, fromNested, toNested, sub);
      }
      next[key] = nested;
    } else {
      apply(next, c, f, t, key);
    }
  }
  if (applied === 0) return { nodes, applied, skipped };
  return {
    nodes: { ...nodes, [id]: next as unknown as SceneNode },
    applied,
    skipped,
  };
}
