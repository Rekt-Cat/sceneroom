import type { Vec3 } from "./index";
import type { ShapeMesh } from "./modifiers";
import { normalizeHexColor } from "./color";
import {
  CHARACTER_BONES,
  HAIR_STYLES,
  characterSchema,
  type CharacterBone,
  type AssetInfo,
  type CharacterSettings,
  type Scene,
  type SceneNode,
} from "./scene";
import { addAsset, addNode, availableName, createNode } from "./sceneOps";
import { createRandom, type Scatter } from "./plant";

// ---- 4x4 matrices (16 numbers, column by column, like three.js) ----

export type Matrix = number[];

const identity = (): Matrix => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** a * b: apply b first, then a. */
function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

const translation = (x: number, y: number, z: number): Matrix => {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
};

/**
 * A turn by Euler angles in radians in the order three.js calls "XYZ" (its default): the matrix is
 * Rx * Ry * Rz, so a point is turned about z first, then y, then x.
 */
export function rotationXYZ(x: number, y: number, z: number): Matrix {
  const [a, b] = [Math.cos(x), Math.sin(x)];
  const [c, d] = [Math.cos(y), Math.sin(y)];
  const [e, f] = [Math.cos(z), Math.sin(z)];
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [
    c * e,
    af + be * d,
    bf - ae * d,
    0,
    -c * f,
    ae - bf * d,
    be + af * d,
    0,
    d,
    -b * c,
    a * c,
    0,
    0,
    0,
    0,
    1,
  ];
}

function transformPoint(m: Matrix, x: number, y: number, z: number): Vec3 {
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

// ---- The skeleton ----

/** The parent of each bone (null for the root). */
export const BONE_PARENT: Record<CharacterBone, CharacterBone | null> = {
  hips: null,
  spine: "hips",
  neck: "spine",
  head: "neck",
  "upperArm.L": "spine",
  "foreArm.L": "upperArm.L",
  "hand.L": "foreArm.L",
  "upperArm.R": "spine",
  "foreArm.R": "upperArm.R",
  "hand.R": "foreArm.R",
  "upperLeg.L": "hips",
  "lowerLeg.L": "upperLeg.L",
  "foot.L": "lowerLeg.L",
  "upperLeg.R": "hips",
  "lowerLeg.R": "upperLeg.R",
  "foot.R": "lowerLeg.R",
};

/** What each bone is called for people, in the pose controls. */
export const BONE_LABELS: Record<CharacterBone, string> = {
  hips: "Hips",
  spine: "Spine",
  neck: "Neck",
  head: "Head",
  "upperArm.L": "Left upper arm",
  "foreArm.L": "Left forearm",
  "hand.L": "Left hand",
  "upperArm.R": "Right upper arm",
  "foreArm.R": "Right forearm",
  "hand.R": "Right hand",
  "upperLeg.L": "Left thigh",
  "lowerLeg.L": "Left shin",
  "foot.L": "Left foot",
  "upperLeg.R": "Right thigh",
  "lowerLeg.R": "Right shin",
  "foot.R": "Right foot",
};

/** The three ways a bone can be turned, in the pose controls. */
export const POSE_CHANNELS = ["swing", "out", "twist"] as const;
export type PoseChannel = (typeof POSE_CHANNELS)[number];

type Range = [number, number];

/**
 * How a bone turns. `rotation = [swing * x, twist * y, out * z]` in degrees (each multiplied by its sign), so
 * that for every bone a positive number means the same thing on both sides of the body:
 * swing is forwards (or, for a knee, bent; for a foot, toes up), out is away from the middle, twist is
 * turning outwards. The ranges are what a person's joint can do; a channel with the range [0, 0] is
 * not used by that bone (a knee does not swing sideways).
 */
export type BoneMotion = {
  signs: [number, number, number]; // for swing, twist, out
  swing: Range;
  out: Range;
  twist: Range;
};

const arm = (side: 1 | -1): BoneMotion => ({
  signs: [-1, side, side],
  swing: [-60, 180],
  out: [-40, 180],
  twist: [-90, 90],
});
const leg = (side: 1 | -1): BoneMotion => ({
  signs: [-1, side, side],
  swing: [-45, 120],
  out: [-20, 60],
  twist: [-45, 45],
});

export const BONE_MOTION: Record<CharacterBone, BoneMotion> = {
  hips: {
    signs: [1, 1, -1],
    swing: [-45, 45],
    out: [-30, 30],
    twist: [-60, 60],
  },
  spine: {
    signs: [1, 1, -1],
    swing: [-30, 60],
    out: [-35, 35],
    twist: [-60, 60],
  },
  neck: {
    signs: [1, 1, -1],
    swing: [-40, 50],
    out: [-35, 35],
    twist: [-80, 80],
  },
  head: {
    signs: [1, 1, -1],
    swing: [-40, 50],
    out: [-35, 35],
    twist: [-80, 80],
  },
  "upperArm.L": arm(1),
  "foreArm.L": {
    signs: [-1, 1, 1],
    swing: [0, 150],
    out: [0, 0],
    twist: [-90, 90],
  },
  "hand.L": {
    signs: [-1, 1, 1],
    swing: [-60, 60],
    out: [-30, 30],
    twist: [-90, 90],
  },
  "upperArm.R": arm(-1),
  "foreArm.R": {
    signs: [-1, -1, -1],
    swing: [0, 150],
    out: [0, 0],
    twist: [-90, 90],
  },
  "hand.R": {
    signs: [-1, -1, -1],
    swing: [-60, 60],
    out: [-30, 30],
    twist: [-90, 90],
  },
  "upperLeg.L": leg(1),
  "lowerLeg.L": {
    signs: [1, 1, 1],
    swing: [0, 150],
    out: [0, 0],
    twist: [-30, 30],
  },
  "foot.L": {
    signs: [-1, 1, 1],
    swing: [-45, 45],
    out: [-20, 20],
    twist: [-30, 30],
  },
  "upperLeg.R": leg(-1),
  "lowerLeg.R": {
    signs: [1, -1, -1],
    swing: [0, 150],
    out: [0, 0],
    twist: [-30, 30],
  },
  "foot.R": {
    signs: [-1, -1, -1],
    swing: [-45, 45],
    out: [-20, 20],
    twist: [-30, 30],
  },
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** The turn of a bone, as angles in radians for three.js ("XYZ" order), from its pose angles [swing, out, twist]. */
export function boneRotation(
  bone: CharacterBone,
  angles: readonly [number, number, number] | undefined,
): Vec3 {
  if (!angles) return [0, 0, 0];
  const [sx, sy, sz] = BONE_MOTION[bone].signs;
  const [swing, out, twist] = angles;
  return [toRadians(swing * sx), toRadians(twist * sy), toRadians(out * sz)];
}

/** The measurements of a character's body, worked out from its settings. All in units. */
export type Proportions = {
  height: number;
  footHeight: number;
  legLength: number;
  thigh: number;
  shin: number;
  waist: number;
  chest: number;
  shoulderY: number;
  neckLength: number;
  headRadius: Vec3;
  shoulderX: number;
  hipX: number;
  upperArm: number;
  foreArm: number;
  hand: number;
  armRadius: number;
  legRadius: number;
  torsoDepth: number;
  waistHalf: number;
  shoulderHalf: number;
};

export function proportions(s: CharacterSettings): Proportions {
  const H = s.height;
  const b = s.build;
  const footHeight = 0.04 * H;
  const legLength = H * s.legRatio;
  const legSpan = legLength - footHeight;
  const armTotal = 0.36 * H * s.armScale;
  const armRadius = 0.03 * H * (1 + 0.6 * b);
  const shoulderX = (0.1 + 0.035 * b) * H;
  return {
    height: H,
    footHeight,
    legLength,
    thigh: legSpan * 0.52,
    shin: legSpan * 0.48,
    waist: 0.08 * H,
    chest: 0.23 * H,
    shoulderY: 0.19 * H,
    neckLength: 0.045 * H,
    headRadius: [
      0.075 * H * s.headSize,
      0.085 * H * s.headSize,
      0.08 * H * s.headSize,
    ],
    shoulderX,
    hipX: (0.045 + 0.02 * b) * H,
    upperArm: armTotal * 0.46,
    foreArm: armTotal * 0.42,
    hand: armTotal * 0.12,
    armRadius,
    legRadius: 0.048 * H * (1 + 0.5 * b),
    torsoDepth: 0.1 * H * (1 + 0.5 * b),
    waistHalf: (0.075 + 0.03 * b) * H,
    shoulderHalf: shoulderX + armRadius,
  };
}

/** Where each bone's joint is when the character is at rest, measured from its parent's joint. */
export function restOffsets(p: Proportions): Record<CharacterBone, Vec3> {
  return {
    hips: [0, p.legLength, 0],
    spine: [0, p.waist, 0],
    neck: [0, p.chest, 0],
    head: [0, p.neckLength, 0],
    "upperArm.L": [p.shoulderX, p.shoulderY, 0],
    "foreArm.L": [0, -p.upperArm, 0],
    "hand.L": [0, -p.foreArm, 0],
    "upperArm.R": [-p.shoulderX, p.shoulderY, 0],
    "foreArm.R": [0, -p.upperArm, 0],
    "hand.R": [0, -p.foreArm, 0],
    "upperLeg.L": [p.hipX, 0, 0],
    "lowerLeg.L": [0, -p.thigh, 0],
    "foot.L": [0, -p.shin, 0],
    "upperLeg.R": [-p.hipX, 0, 0],
    "lowerLeg.R": [0, -p.thigh, 0],
    "foot.R": [0, -p.shin, 0],
  };
}

// ---- Building the parts of the body ----

/** What a part is made of, so it can be coloured: each role takes one colour of the character. */
export const COLOR_ROLES = [
  "skin",
  "hair",
  "shirt",
  "pants",
  "shoes",
  "eyes",
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

/** The colour of the eyes (not a setting). */
export const EYE_COLOR = "#1b1b1b";

/** The colour a role has for a character. */
export function roleColor(s: CharacterSettings, role: ColorRole): string {
  switch (role) {
    case "skin":
      return s.skinColor;
    case "hair":
      return s.hairColor;
    case "shirt":
      return s.shirtColor;
    case "pants":
      return s.pantsColor;
    case "shoes":
      return s.shoesColor;
    case "eyes":
      return EYE_COLOR;
  }
}

/** One piece of the body: its triangles, in the space of the bone it is attached to (the bone's joint is the origin). */
export type BodyPart = {
  bone: CharacterBone;
  role: ColorRole;
  mesh: ShapeMesh;
};

class Parts {
  positions: number[] = [];
  indices: number[] = [];
  point(x: number, y: number, z: number): number {
    const id = this.positions.length / 3;
    this.positions.push(x, y, z);
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
 * A tube along the y axis from `y0` to `y1`, `r0` wide at the start and `r1` at the end, centred at (cx, cz),
 * closed at both ends. Triangles face outwards (counter-clockwise seen from outside).
 */
function addTube(
  m: Parts,
  y0: number,
  y1: number,
  r0: number,
  r1: number,
  sides: number,
  cx = 0,
  cz = 0,
): void {
  // A tube that runs downwards is the same shape as one that runs upwards with its ends swapped; the
  // triangles below are wound for an upward one, so build it that way round
  if (y1 < y0) return addTube(m, y1, y0, r1, r0, sides, cx, cz);
  const bottom: number[] = [];
  const top: number[] = [];
  for (let j = 0; j < sides; j++) {
    const angle = (j / sides) * Math.PI * 2;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    bottom.push(m.point(cx + c * r0, y0, cz - s * r0));
    top.push(m.point(cx + c * r1, y1, cz - s * r1));
  }
  for (let j = 0; j < sides; j++) {
    const k = (j + 1) % sides;
    m.triangle(bottom[j]!, bottom[k]!, top[k]!);
    m.triangle(bottom[j]!, top[k]!, top[j]!);
  }
  const bottomMiddle = m.point(cx, y0, cz);
  const topMiddle = m.point(cx, y1, cz);
  for (let j = 0; j < sides; j++) {
    const k = (j + 1) % sides;
    m.triangle(bottom[k]!, bottom[j]!, bottomMiddle);
    m.triangle(top[j]!, top[k]!, topMiddle);
  }
}

/** A box that may be a different size at the bottom and the top (a tapered block), from `y0` to `y1`, centred at (cx, cz). */
function addBlock(
  m: Parts,
  y0: number,
  y1: number,
  wBottom: number,
  dBottom: number,
  wTop: number,
  dTop: number,
  cx = 0,
  cz = 0,
): void {
  const corner = (y: number, w: number, d: number, sx: number, sz: number) =>
    m.point(cx + (sx * w) / 2, y, cz + (sz * d) / 2);
  // bottom: 0..3 (counter-clockwise seen from below is clockwise seen from above), top: 4..7
  const b = [
    corner(y0, wBottom, dBottom, -1, -1),
    corner(y0, wBottom, dBottom, 1, -1),
    corner(y0, wBottom, dBottom, 1, 1),
    corner(y0, wBottom, dBottom, -1, 1),
  ];
  const t = [
    corner(y1, wTop, dTop, -1, -1),
    corner(y1, wTop, dTop, 1, -1),
    corner(y1, wTop, dTop, 1, 1),
    corner(y1, wTop, dTop, -1, 1),
  ];
  // bottom face (faces down), top face (faces up)
  m.triangle(b[0]!, b[1]!, b[2]!);
  m.triangle(b[0]!, b[2]!, b[3]!);
  m.triangle(t[0]!, t[2]!, t[1]!);
  m.triangle(t[0]!, t[3]!, t[2]!);
  // the four sides
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    m.triangle(b[i]!, t[i]!, t[j]!);
    m.triangle(b[i]!, t[j]!, b[j]!);
  }
}

/**
 * An egg-shaped lump (an ellipsoid) with its middle at (cx, cy, cz). `polarMax` is how far round from the top
 * it goes, in radians (PI = all the way round; less leaves an open bottom, used for a cap of hair).
 */
function addEllipsoid(
  m: Parts,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  rows = 6,
  columns = 8,
  polarMax = Math.PI,
): void {
  const grid: number[][] = [];
  const top = m.point(cx, cy + ry, cz);
  for (let i = 1; i <= rows; i++) {
    const theta = (i / rows) * polarMax;
    const ring: number[] = [];
    for (let j = 0; j < columns; j++) {
      const phi = (j / columns) * Math.PI * 2;
      ring.push(
        m.point(
          cx + rx * Math.sin(theta) * Math.cos(phi),
          cy + ry * Math.cos(theta),
          cz - rz * Math.sin(theta) * Math.sin(phi),
        ),
      );
    }
    grid.push(ring);
  }
  const first = grid[0]!;
  for (let j = 0; j < columns; j++) {
    m.triangle(top, first[j]!, first[(j + 1) % columns]!);
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < columns; j++) {
      const k = (j + 1) % columns;
      m.triangle(grid[i]![j]!, grid[i + 1]![j]!, grid[i + 1]![k]!);
      m.triangle(grid[i]![j]!, grid[i + 1]![k]!, grid[i]![k]!);
    }
  }
  // (When the lump goes all the way round, its last ring collapses to the bottom pole, so no cap is needed)
}

/** The pieces of a character's body, each attached to a bone. Does not depend on the pose. */
export function buildParts(s: CharacterSettings): BodyPart[] {
  const p = proportions(s);
  const parts: BodyPart[] = [];
  const part = (
    bone: CharacterBone,
    role: ColorRole,
    make: (m: Parts) => void,
  ) => {
    const m = new Parts();
    make(m);
    parts.push({ bone, role, mesh: m.build() });
  };
  const sleeve: ColorRole = s.longSleeves ? "shirt" : "skin";
  const lowerLegRole: ColorRole = s.longPants ? "pants" : "skin";
  const jointBall = (m: Parts, radius: number) =>
    addEllipsoid(m, 0, 0, 0, radius, radius, radius, 4, 6);

  // The middle of the body
  part("hips", "pants", (m) =>
    addBlock(
      m,
      0,
      p.waist,
      p.hipX * 2 + p.legRadius * 1.6,
      p.torsoDepth * 0.95,
      p.waistHalf * 2,
      p.torsoDepth * 0.9,
    ),
  );
  part("spine", "shirt", (m) =>
    addBlock(
      m,
      0,
      p.chest,
      p.waistHalf * 2,
      p.torsoDepth * 0.9,
      p.shoulderHalf * 2,
      p.torsoDepth,
    ),
  );
  part("neck", "skin", (m) =>
    addTube(m, 0, p.neckLength * 1.3, p.armRadius * 0.75, p.armRadius * 0.7, 6),
  );
  const [hx, hy, hz] = p.headRadius;
  part("head", "skin", (m) =>
    addEllipsoid(m, 0, hy * 0.85, 0, hx, hy, hz, 6, 8),
  );
  part("head", "eyes", (m) => {
    for (const side of [-1, 1]) {
      addEllipsoid(
        m,
        side * hx * 0.4,
        hy * 0.95,
        hz * 0.88,
        hx * 0.1,
        hy * 0.1,
        hz * 0.08,
        3,
        5,
      );
    }
  });
  if (s.hair !== "bald") {
    part("head", "hair", (m) => {
      // A cap over the top and back of the head, left open at the front and the bottom so the face shows
      addEllipsoid(
        m,
        0,
        hy * 0.95,
        -hz * 0.12,
        hx * 1.1,
        hy * 1.06,
        hz * 1.12,
        5,
        8,
        Math.PI * 0.62,
      );
      if (s.hair === "long") {
        // Hair falling down the back to the shoulders
        addBlock(
          m,
          -p.neckLength - hy * 0.4,
          hy * 0.9,
          hx * 1.7,
          hz * 0.45,
          hx * 1.9,
          hz * 0.7,
          0,
          -hz * 0.78,
        );
      }
    });
  }

  // The arms and legs: a ball at the joint (so a bent limb has no gap) and a tapered tube down the limb
  for (const side of ["L", "R"] as const) {
    part(`upperArm.${side}`, "shirt", (m) => {
      jointBall(m, p.armRadius * 1.15);
      addTube(m, 0, -p.upperArm, p.armRadius, p.armRadius * 0.9, 6);
    });
    part(`foreArm.${side}`, sleeve, (m) => {
      jointBall(m, p.armRadius * 0.95);
      addTube(m, 0, -p.foreArm, p.armRadius * 0.9, p.armRadius * 0.75, 6);
    });
    part(`hand.${side}`, "skin", (m) =>
      addEllipsoid(
        m,
        0,
        -p.hand * 0.5,
        0,
        p.armRadius * 0.9,
        p.hand * 0.6,
        p.armRadius * 0.7,
        4,
        6,
      ),
    );
    part(`upperLeg.${side}`, "pants", (m) => {
      jointBall(m, p.legRadius * 1.05);
      addTube(m, 0, -p.thigh, p.legRadius, p.legRadius * 0.85, 6);
    });
    part(`lowerLeg.${side}`, lowerLegRole, (m) => {
      jointBall(m, p.legRadius * 0.85);
      addTube(m, 0, -p.shin, p.legRadius * 0.85, p.legRadius * 0.65, 6);
    });
    part(`foot.${side}`, "shoes", (m) =>
      addBlock(
        m,
        -p.footHeight,
        p.legRadius * 0.2,
        p.legRadius * 1.5,
        p.height * 0.13,
        p.legRadius * 1.3,
        p.height * 0.1,
        0,
        p.height * 0.035,
      ),
    );
  }
  return parts;
}

// ---- Posing ----

/**
 * The matrix of each bone in the 3D space of the character (its feet standing on the origin, facing +z), for a
 * pose: a bone's matrix is its parent's, then a move to its joint, then its turn. `lift` raises the whole body.
 */
export function boneMatrices(
  s: CharacterSettings,
  lift = 0,
): Record<CharacterBone, Matrix> {
  const offsets = restOffsets(proportions(s));
  const matrices = {} as Record<CharacterBone, Matrix>;
  for (const bone of CHARACTER_BONES) {
    const parent = BONE_PARENT[bone];
    const [ox, oy, oz] = offsets[bone];
    const [rx, ry, rz] = boneRotation(bone, s.pose[bone]);
    const local = multiply(
      translation(ox, bone === "hips" ? oy + lift : oy, oz),
      rotationXYZ(rx, ry, rz),
    );
    matrices[bone] = parent ? multiply(matrices[parent], local) : local;
  }
  return matrices;
}

/** The corners of the box around a set of points. */
export type Bounds = { min: Vec3; max: Vec3 };

function growBounds(bounds: Bounds, point: Vec3): void {
  for (let k = 0; k < 3; k++) {
    if (point[k]! < bounds.min[k]!) bounds.min[k] = point[k]!;
    if (point[k]! > bounds.max[k]!) bounds.max[k] = point[k]!;
  }
}

/** The posed points of every part: for each, its role and its points in the character's space. */
function posedPoints(
  parts: readonly BodyPart[],
  matrices: Record<CharacterBone, Matrix>,
): { part: BodyPart; points: Float32Array }[] {
  return parts.map((part) => {
    const matrix = matrices[part.bone];
    const points = new Float32Array(part.mesh.positions.length);
    for (let i = 0; i < points.length; i += 3) {
      const p = transformPoint(
        matrix,
        part.mesh.positions[i]!,
        part.mesh.positions[i + 1]!,
        part.mesh.positions[i + 2]!,
      );
      points.set(p, i);
    }
    return { part, points };
  });
}

/**
 * How far the body has to be raised so that its lowest point is on the ground (y = 0), for the pose. Zero
 * when `onGround` is off. A standing character is already on the ground; a sitting one lowers its hips (a
 * negative number), a character with a lifted foot is still held up by the other.
 */
export function groundLift(
  s: CharacterSettings,
  parts: readonly BodyPart[] = buildParts(s),
): number {
  if (!s.onGround) return 0;
  let lowest = Infinity;
  for (const { points } of posedPoints(parts, boneMatrices(s, 0))) {
    for (let i = 1; i < points.length; i += 3)
      lowest = Math.min(lowest, points[i]!);
  }
  return Number.isFinite(lowest) ? -lowest : 0;
}

/** The box around the whole posed character (standing on the ground if `onGround` is on). */
export function characterBounds(s: CharacterSettings): Bounds {
  const parts = buildParts(s);
  const lift = groundLift(s, parts);
  const bounds: Bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const { points } of posedPoints(parts, boneMatrices(s, lift))) {
    for (let i = 0; i < points.length; i += 3)
      growBounds(bounds, [points[i]!, points[i + 1]!, points[i + 2]!]);
  }
  return bounds;
}

/** The place of each joint in the character's space, for the pose (to draw the skeleton, or to test the pose). */
export function jointPositions(
  s: CharacterSettings,
): Record<CharacterBone, Vec3> {
  const lift = groundLift(s);
  const matrices = boneMatrices(s, lift);
  const out = {} as Record<CharacterBone, Vec3>;
  for (const bone of CHARACTER_BONES)
    out[bone] = [matrices[bone][12]!, matrices[bone][13]!, matrices[bone][14]!];
  return out;
}

/**
 * The whole character as plain meshes in its posed shape, one per colour (a skin mesh, a hair mesh, a shirt
 * mesh ...), standing on the ground. This is what "Make mesh" stores: the pose is baked into the points. A
 * colour the character does not use (no hair) is left out.
 */
export function bakeCharacter(
  s: CharacterSettings,
): Partial<Record<ColorRole, ShapeMesh>> {
  const parts = buildParts(s);
  const lift = groundLift(s, parts);
  const builders: Partial<
    Record<ColorRole, { positions: number[]; indices: number[] }>
  > = {};
  for (const { part, points } of posedPoints(parts, boneMatrices(s, lift))) {
    const builder = (builders[part.role] ??= { positions: [], indices: [] });
    const offset = builder.positions.length / 3;
    for (const value of points) builder.positions.push(value);
    for (const index of part.mesh.indices) builder.indices.push(index + offset);
  }
  const result: Partial<Record<ColorRole, ShapeMesh>> = {};
  for (const role of COLOR_ROLES) {
    const b = builders[role];
    if (b && b.positions.length > 0) {
      result[role] = {
        positions: Float32Array.from(b.positions),
        indices: Uint32Array.from(b.indices),
      };
    }
  }
  return result;
}

// ---- Kinds of character and poses ----

/** The kinds of character that can be added, each a starting look (everything can be changed afterwards). */
export const CHARACTER_PRESET_NAMES = [
  "person",
  "child",
  "stocky",
  "tall",
] as const;
export type CharacterPresetName = (typeof CHARACTER_PRESET_NAMES)[number];

export const CHARACTER_PRESET_INFO: Record<
  CharacterPresetName,
  { label: string; hint: string }
> = {
  person: { label: "Person", hint: "An adult of average build" },
  child: { label: "Child", hint: "Small, with a big head and short legs" },
  stocky: { label: "Stocky", hint: "Broad and strong" },
  tall: { label: "Tall", hint: "Tall and slim, with long legs" },
};

/** The starting look of each kind. The pose is not part of it (a kind button keeps the pose). */
export const CHARACTER_PRESETS: Record<CharacterPresetName, CharacterSettings> =
  {
    person: characterSchema.parse({}),
    child: characterSchema.parse({
      height: 1.1,
      build: 0.3,
      headSize: 1.35,
      legRatio: 0.42,
      armScale: 0.95,
      hair: "short",
      shirtColor: "#e0a53a",
      pantsColor: "#4a6fa5",
    }),
    stocky: characterSchema.parse({
      height: 1.75,
      build: 0.95,
      headSize: 1.05,
      legRatio: 0.45,
      armScale: 1.05,
      hair: "bald",
      shirtColor: "#8a3b2f",
      pantsColor: "#2f3a2f",
    }),
    tall: characterSchema.parse({
      height: 1.95,
      build: 0.05,
      headSize: 0.95,
      legRatio: 0.5,
      armScale: 1.1,
      hair: "long",
      hairColor: "#b5852d",
      shirtColor: "#7a3f8f",
      pantsColor: "#25252e",
    }),
  };

export const POSE_PRESET_NAMES = [
  "stand",
  "tpose",
  "wave",
  "walk",
  "run",
  "sit",
] as const;
export type PosePresetName = (typeof POSE_PRESET_NAMES)[number];

export const POSE_PRESET_LABELS: Record<PosePresetName, string> = {
  stand: "Stand",
  tpose: "T-pose",
  wave: "Wave",
  walk: "Walk",
  run: "Run",
  sit: "Sit",
};

type Pose = CharacterSettings["pose"];

/** The poses, as [swing, out, twist] in degrees for the bones that are not at rest. */
export const POSE_PRESETS: Record<PosePresetName, Pose> = {
  stand: {},
  // Arms straight out to the sides, the pose characters are usually rigged in
  tpose: { "upperArm.L": [0, 90, 0], "upperArm.R": [0, 90, 0] },
  // The right arm raised, with the forearm waving
  wave: {
    "upperArm.R": [0, 125, 0],
    "foreArm.R": [55, 0, 0],
    "hand.R": [0, 20, 0],
    "upperArm.L": [10, 8, 0],
  },
  // A step: left leg forward and right leg back, with the opposite arms swinging
  walk: {
    "upperLeg.L": [25, 0, 0],
    "lowerLeg.L": [8, 0, 0],
    "upperLeg.R": [-20, 0, 0],
    "lowerLeg.R": [28, 0, 0],
    "foot.R": [-15, 0, 0],
    "upperArm.L": [-22, 4, 0],
    "foreArm.L": [12, 0, 0],
    "upperArm.R": [24, 4, 0],
    "foreArm.R": [18, 0, 0],
  },
  // A stride with bent arms and a lean forward
  run: {
    spine: [14, 0, 0],
    "upperLeg.L": [65, 0, 0],
    "lowerLeg.L": [95, 0, 0],
    "upperLeg.R": [-35, 0, 0],
    "lowerLeg.R": [25, 0, 0],
    "upperArm.L": [-55, 5, 0],
    "foreArm.L": [90, 0, 0],
    "upperArm.R": [60, 5, 0],
    "foreArm.R": [90, 0, 0],
  },
  // Sitting: thighs forward, shins down, hands near the knees (the body lowers itself onto the ground)
  sit: {
    "upperLeg.L": [90, 0, 0],
    "lowerLeg.L": [90, 0, 0],
    "upperLeg.R": [90, 0, 0],
    "lowerLeg.R": [90, 0, 0],
    "upperArm.L": [35, 5, 0],
    "foreArm.L": [40, 0, 0],
    "upperArm.R": [35, 5, 0],
    "foreArm.R": [40, 0, 0],
  },
};

// ---- Changing the settings ----

export type CharacterChange = Partial<CharacterSettings>;

const NUMBER_RANGES = {
  height: [0.3, 3],
  build: [0, 1],
  headSize: [0.6, 1.6],
  legRatio: [0.35, 0.6],
  armScale: [0.7, 1.3],
} as const;

const COLOR_KEYS = [
  "skinColor",
  "hairColor",
  "shirtColor",
  "pantsColor",
  "shoesColor",
] as const;
const FLAG_KEYS = ["longSleeves", "longPants", "onGround"] as const;

/**
 * Cleans up a pose: only known bones are kept, each with three finite angles kept inside what that bone's
 * joint can do (a knee cannot bend backwards), and a bone at rest (all zero) is left out.
 */
export function sanitizePose(pose: unknown): Pose {
  const clean: Pose = {};
  if (typeof pose !== "object" || pose === null) return clean;
  for (const bone of CHARACTER_BONES) {
    const angles = (pose as Record<string, unknown>)[bone];
    if (!Array.isArray(angles) || angles.length !== 3) continue;
    if (
      !angles.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    )
      continue;
    const motion = BONE_MOTION[bone];
    const limited: [number, number, number] = [
      Math.min(motion.swing[1], Math.max(motion.swing[0], angles[0] as number)),
      Math.min(motion.out[1], Math.max(motion.out[0], angles[1] as number)),
      Math.min(motion.twist[1], Math.max(motion.twist[0], angles[2] as number)),
    ];
    // "+ 0" turns a negative zero into a plain zero
    const plain: [number, number, number] = [
      limited[0] + 0,
      limited[1] + 0,
      limited[2] + 0,
    ];
    if (plain.some((value) => value !== 0)) clean[bone] = plain;
  }
  return clean;
}

/**
 * Cleans up a change to character settings: numbers that are not finite are dropped and the rest kept inside
 * their range; colours must be valid hex codes; the hair style one of the three; switches true or false; the
 * pose is cleaned bone by bone (see `sanitizePose`). Anything else is dropped.
 */
export function sanitizeCharacterChange(
  change: CharacterChange,
): CharacterChange {
  const clean: Record<string, unknown> = {};
  for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
    const value = (change as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = Math.min(max, Math.max(min, value));
    }
  }
  for (const key of COLOR_KEYS) {
    const value = change[key];
    if (typeof value !== "string") continue;
    const color = normalizeHexColor(value);
    if (color !== null) clean[key] = color;
  }
  for (const key of FLAG_KEYS) {
    if (typeof change[key] === "boolean") clean[key] = change[key];
  }
  if ((HAIR_STYLES as readonly string[]).includes(change.hair as string)) {
    clean["hair"] = change.hair;
  }
  if (change.pose !== undefined) clean["pose"] = sanitizePose(change.pose);
  return clean as CharacterChange;
}

/** True if two sets of angles (poses) are exactly the same. */
export function samePose(a: Pose, b: Pose): boolean {
  return CHARACTER_BONES.every((bone) => {
    const x = a[bone] ?? [0, 0, 0];
    const y = b[bone] ?? [0, 0, 0];
    return x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
  });
}

/** True if applying the (cleaned) change would alter at least one setting. */
export function characterChangeDiffers(
  character: CharacterSettings,
  change: CharacterChange,
): boolean {
  return (Object.keys(change) as (keyof CharacterSettings)[]).some((key) => {
    const value = change[key];
    if (value === undefined) return false;
    return key === "pose"
      ? !samePose(character.pose, value as Pose)
      : character[key] !== value;
  });
}

/** True if two characters are exactly the same (every number, colour, switch and angle). */
export function sameCharacter(
  a: CharacterSettings,
  b: CharacterSettings,
): boolean {
  return (
    samePose(a.pose, b.pose) &&
    (Object.keys(a) as (keyof CharacterSettings)[]).every(
      (key) => key === "pose" || a[key] === b[key],
    )
  );
}

/** A new character object of a kind: standing at the middle of the scene at rest, with faceted shading. */
export function createCharacterNode(
  id: string,
  preset: CharacterPresetName,
): SceneNode {
  const base = createNode(id, "cube");
  return {
    ...base,
    name: CHARACTER_PRESET_INFO[preset].label,
    kind: "character",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    material: {
      ...base.material,
      flatShading: true,
      roughness: 0.85,
      metalness: 0,
    },
    character: { ...CHARACTER_PRESETS[preset] },
  };
}

/** Changes some settings of a character, keeping the others. Throws for an object that is not a character. */
export function setCharacter(
  scene: Scene,
  id: string,
  change: CharacterChange,
): Scene {
  const node = scene.nodes[id];
  if (!node) throw new Error(`Node "${id}" does not exist`);
  if (!node.character) throw new Error(`Node "${id}" is not a character`);
  return {
    ...scene,
    nodes: {
      ...scene.nodes,
      [id]: { ...node, character: { ...node.character, ...change } },
    },
  };
}

// ---- Randomising the look, and crowds ----

const SKIN_TONES = [
  "#f6d3b3",
  "#e0ac84",
  "#c68642",
  "#a8693c",
  "#8d5524",
  "#5c3a21",
];
const HAIR_COLORS = [
  "#1c1c1c",
  "#3b2a1e",
  "#6a4a2a",
  "#b5852d",
  "#d9b872",
  "#8a3b1f",
  "#bdbdbd",
];
const SHIRT_COLORS = [
  "#3d6fb6",
  "#b5443a",
  "#4a8f4f",
  "#e0a53a",
  "#7a3f8f",
  "#e8e8e8",
  "#2f2f35",
  "#d86f9a",
];
const PANTS_COLORS = [
  "#3a3f4b",
  "#2b3a55",
  "#6b5a3a",
  "#2f2f2f",
  "#5a6b4a",
  "#7a7f8a",
];
const SHOE_COLORS = ["#2a2522", "#4a3322", "#e8e8e8", "#3b3b44", "#7a2f2f"];

const pick = <T>(list: readonly T[], random: () => number): T =>
  list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;

/**
 * A different look for a character: new colours from natural palettes (skin, hair) and a clothes palette, a
 * hair style, sleeves and trousers, and a little change in height and build (`amount` is how much). The pose
 * is kept. Sizes are varied by a factor that balances up and down, and `createCharacterRandomiser` varies
 * around one starting character, so pressing it again and again never drifts.
 */
export function randomiseLook(
  character: CharacterSettings,
  random: () => number,
  amount = 0.12,
): CharacterChange {
  const step = () => (random() * 2 - 1) * amount;
  return sanitizeCharacterChange({
    height:
      character.height * Math.pow(1 + amount, amount > 0 ? step() / amount : 0),
    build: character.build + step() * 2,
    headSize:
      character.headSize *
      Math.pow(1 + amount, amount > 0 ? step() / amount : 0),
    skinColor: pick(SKIN_TONES, random),
    hairColor: pick(HAIR_COLORS, random),
    shirtColor: pick(SHIRT_COLORS, random),
    pantsColor: pick(PANTS_COLORS, random),
    shoesColor: pick(SHOE_COLORS, random),
    hair: pick(HAIR_STYLES, random),
    longSleeves: random() < 0.4,
    longPants: random() < 0.8,
  });
}

/** The Randomise button's memory: every press varies the character it STARTED from (not the last result), like `createPlantRandomiser`. */
export function createCharacterRandomiser(): (
  current: CharacterSettings,
  random: () => number,
  amount?: number,
) => CharacterChange {
  let anchor: CharacterSettings | null = null;
  let produced: CharacterSettings | null = null;
  return (current, random, amount) => {
    if (!anchor || !produced || !sameCharacter(current, produced))
      anchor = current;
    const change = randomiseLook(anchor, random, amount);
    produced = { ...anchor, ...change };
    return change;
  };
}

/**
 * Adds a crowd: a copy of a character object at each spot, each with a look of its own (colours, hair, a little
 * change in size and build) and the same pose, in the same parent as the original. Spots come from
 * `scatterSpots`. The ids come from `generateId`. Returns the new scene and the ids of the copies.
 */
export function scatterCharacters(
  scene: Scene,
  nodeId: string,
  spots: readonly Scatter[],
  generateId: () => string,
): { scene: Scene; ids: string[] } {
  const original = scene.nodes[nodeId];
  if (!original?.character)
    throw new Error(`Node "${nodeId}" is not a character`);
  let next = scene;
  const ids: string[] = [];
  for (const spot of spots) {
    const id = generateId();
    const { position, scale: size, rotation } = original.transform;
    next = addNode(next, {
      ...original,
      id,
      name: availableName(next, original.name),
      transform: {
        position: [position[0] + spot.x, position[1], position[2] + spot.z],
        rotation: [rotation[0], spot.turn, rotation[2]],
        scale: [size[0] * spot.size, size[1] * spot.size, size[2] * spot.size],
      },
      character: {
        ...original.character,
        ...randomiseLook(original.character, createRandom(spot.seed)),
      },
    });
    ids.push(id);
  }
  return { scene: next, ids };
}

// ---- Turning a character into meshes ----

/** What to put in the scene for one baked piece of a character (a skin mesh, a shirt mesh ...). */
export type BakedPiece = { role: ColorRole; info: AssetInfo; nodeId: string };

/**
 * Turns a character object into editable meshes: the object itself becomes the skin mesh (it keeps its place,
 * name and children), and a new mesh object is added INSIDE it for each other colour (hair, shirt, trousers,
 * shoes, eyes), in that colour and with the same surface, so they move together. The character settings are
 * cleared (the pose is baked into the points). `pieces` must include the skin. Throws for an object that is
 * not a character, or if the pieces are not meshes or have no skin.
 */
export function bakeCharacterToMeshes(
  scene: Scene,
  nodeId: string,
  pieces: readonly BakedPiece[],
): Scene {
  const node = scene.nodes[nodeId];
  if (!node) throw new Error(`Node "${nodeId}" does not exist`);
  const character = node.character;
  if (!character) throw new Error(`Node "${nodeId}" is not a character`);
  const skin = pieces.find((piece) => piece.role === "skin");
  if (!skin) throw new Error("A character needs a skin mesh");
  if (pieces.some((piece) => piece.info.type !== "mesh")) {
    throw new Error("The stored data is not a mesh");
  }
  let next = addAsset(scene, skin.info);
  next = {
    ...next,
    nodes: {
      ...next.nodes,
      [nodeId]: {
        ...node,
        kind: "mesh",
        assetId: skin.info.id,
        character: null,
        color: character.skinColor,
      },
    },
  };
  for (const piece of pieces) {
    if (piece.role === "skin") continue;
    next = addAsset(next, piece.info);
    next = addNode(next, {
      ...createNode(piece.nodeId, "cube"),
      name: availableName(next, `${node.name} ${piece.role}`),
      kind: "mesh",
      parentId: nodeId,
      assetId: piece.info.id,
      // At the character's origin, not where a new cube would start, so the pieces line up
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      color: roleColor(character, piece.role),
      material: { ...node.material },
    });
  }
  return next;
}
