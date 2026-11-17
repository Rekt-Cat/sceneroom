import type { Vec3 } from "./index";

/** Which fly keys are down: W forward, S back, A left, D right, E up, Q down. */
export type FlyKeys = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

export const NO_FLY_KEYS: FlyKeys = {
  forward: false,
  back: false,
  left: false,
  right: false,
  up: false,
  down: false,
};

/** The key codes (`KeyboardEvent.code`) that fly the camera, and what each does. */
export const FLY_KEY_CODES: Record<string, keyof FlyKeys> = {
  KeyW: "forward",
  KeyS: "back",
  KeyA: "left",
  KeyD: "right",
  KeyE: "up",
  KeyQ: "down",
};

const normalize = (v: Vec3): Vec3 | null => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length < 1e-9 ? null : [v[0] / length, v[1] / length, v[2] / length];
};

/** The direction to the right of where the camera looks, level with the ground. Looking straight up or down there is no "right" from the view, so the x axis is used. */
export function rightOf(forward: Vec3): Vec3 {
  // forward x up (up is +y)
  const right = normalize([-forward[2], 0, forward[0]]);
  return right ?? [1, 0, 0];
}

/**
 * The way the camera moves for the keys that are down, as a direction of length 1 (or no movement). Forward
 * and back follow where the camera looks (also up and down), left and right slide level with the ground, and
 * up and down go straight up and down the world, like in the Unity and Unreal scene views.
 */
export function flyDirection(keys: FlyKeys, forward: Vec3): Vec3 {
  const ahead = normalize(forward) ?? [0, 0, -1];
  const right = rightOf(ahead);
  const f = Number(keys.forward) - Number(keys.back);
  const r = Number(keys.right) - Number(keys.left);
  const u = Number(keys.up) - Number(keys.down);
  const move = normalize([
    ahead[0] * f + right[0] * r,
    ahead[1] * f + right[1] * r + u,
    ahead[2] * f + right[2] * r,
  ]);
  return move ?? [0, 0, 0];
}

/** The slowest and fastest the camera flies, in world units per second. */
export const FLY_MIN_SPEED = 2;
export const FLY_MAX_SPEED = 60;
/** How much faster it goes while the fast key (Ctrl or Cmd) is held. */
export const FLY_FAST_FACTOR = 3;
/** Speed is this many times the distance to what is being looked at (so zoomed out flies faster, close up slower). */
export const FLY_SPEED_PER_DISTANCE = 0.9;

/** How fast to fly, from how far the camera is from what it looks at. */
export function flySpeed(distanceToTarget: number, fast: boolean): number {
  const base = Math.min(
    FLY_MAX_SPEED,
    Math.max(FLY_MIN_SPEED, distanceToTarget * FLY_SPEED_PER_DISTANCE),
  );
  return fast ? base * FLY_FAST_FACTOR : base;
}

/** How far to move in one frame (`seconds` long), as x, y, z. A long frame is cut short so a stall does not throw the camera. */
export function flyStep(
  keys: FlyKeys,
  forward: Vec3,
  distanceToTarget: number,
  fast: boolean,
  seconds: number,
): Vec3 {
  const direction = flyDirection(keys, forward);
  const distance = flySpeed(distanceToTarget, fast) * Math.min(seconds, 0.1);
  return [
    direction[0] * distance,
    direction[1] * distance,
    direction[2] * distance,
  ];
}
