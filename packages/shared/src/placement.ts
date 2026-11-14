import type { Vec3 } from "./index";

/**
 * Where a ray (from the camera through the mouse pointer) meets the ground, the flat floor at height 0.
 * Returns null if the ray points up or level (it never reaches the floor) or the hit is absurdly far
 * away (looking almost along the horizon).
 */
export function groundHit(
  origin: Vec3,
  direction: Vec3,
  maxDistance = 200,
): Vec3 | null {
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = direction;
  // Pointing up or level, or already below the floor: no hit in front of the camera
  if (dy >= -1e-6 || oy < 0) return null;
  const t = -oy / dy;
  const x = ox + dx * t;
  const z = oz + dz * t;
  if (Math.hypot(x - ox, z - oz) > maxDistance) return null;
  // "+ 0" turns a negative zero into a plain zero
  return [x + 0, 0, z + 0];
}

/** How far back, and from where, to look at a box so the whole of it fits a picture. */
export function thumbnailFraming(
  boundsMin: Vec3,
  boundsMax: Vec3,
  fovDegrees = 35,
): { target: Vec3; distance: number } {
  const size: Vec3 = [
    boundsMax[0] - boundsMin[0],
    boundsMax[1] - boundsMin[1],
    boundsMax[2] - boundsMin[2],
  ];
  // The ball around the box: whatever way it is turned, it fits inside this
  const radius = Math.max(Math.hypot(...size) / 2, 0.001);
  const halfFov = (fovDegrees * Math.PI) / 180 / 2;
  return {
    target: [
      (boundsMin[0] + boundsMax[0]) / 2,
      (boundsMin[1] + boundsMax[1]) / 2,
      (boundsMin[2] + boundsMax[2]) / 2,
    ],
    // A little extra room so the model does not touch the edges
    distance: (radius / Math.sin(halfFov)) * 1.05,
  };
}
