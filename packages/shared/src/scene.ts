import { z } from "zod";

/** Bump when the saved scene shape changes, so old files can be migrated. */
export const SCENE_SCHEMA_VERSION = 1;

export const NODE_NAME_MAX_LENGTH = 100;

/** Longest source / licence note on an imported file. */
export const ASSET_NOTE_MAX_LENGTH = 500;

/** The colour of a new object (a light blue). */
export const DEFAULT_COLOR = "#5cc4e0";

/** How shiny and how metal a new object looks. 0 to 1: roughness 0 is a mirror, 1 is chalk; metalness 1 is bare metal. */
export const DEFAULT_ROUGHNESS = 0.6;
export const DEFAULT_METALNESS = 0.1;

/** The strongest Reflection strength setting of an object. */
export const MAX_REFLECTION_STRENGTH = 3;

/** Glow colour of a new object: black means no glow. */
export const DEFAULT_EMISSIVE_COLOR = "#000000";

/** How strong the glow is, when the glow colour is not black. 0 to MAX_EMISSIVE_INTENSITY. */
export const DEFAULT_EMISSIVE_INTENSITY = 1;
export const MAX_EMISSIVE_INTENSITY = 5;

/** 1 = solid, 0 = invisible; in between the object is see-through. */
export const DEFAULT_OPACITY = 1;

export const PRIMITIVE_KINDS = [
  "cube",
  "sphere",
  "cylinder",
  "plane",
  "cone",
] as const;

/**
 * The kinds of light: "directional" (sunlight: the same everywhere, only its direction matters),
 * "point" (a bulb: shines in all directions from a spot) and "spot" (a torch: a cone of light).
 */
export const LIGHT_KINDS = ["directional", "point", "spot"] as const;

/**
 * Every kind of object: the built-in shapes, the lights, "model" for a file imported from outside, and
 * "mesh" for an editable mesh made in the editor (both point to their data with `assetId`).
 */
export const NODE_KINDS = [
  ...PRIMITIVE_KINDS,
  ...LIGHT_KINDS,
  "model",
  "mesh",
] as const;

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

/** Rotation is Euler angles in radians (x, y, z), like Three.js. */
export const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema,
});

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * How the surface of an object looks (besides its main colour). Every field has a default, so older
 * scenes, and objects made with only some of the fields, load fine.
 */
export const materialSchema = z.object({
  /** Surface finish, 0 (smooth, shiny) to 1 (rough, matte). */
  roughness: z.number().min(0).max(1).default(DEFAULT_ROUGHNESS),
  /** 0 (plastic, wood, stone) to 1 (metal). */
  metalness: z.number().min(0).max(1).default(DEFAULT_METALNESS),
  /** The colour the object glows with. Black = no glow. */
  emissiveColor: hexColorSchema.default(DEFAULT_EMISSIVE_COLOR),
  /** How strongly it glows (multiplies the glow colour). */
  emissiveIntensity: z
    .number()
    .min(0)
    .max(MAX_EMISSIVE_INTENSITY)
    .default(DEFAULT_EMISSIVE_INTENSITY),
  /** 1 = solid; less = see-through. */
  opacity: z.number().min(0).max(1).default(DEFAULT_OPACITY),
  /** Draw the inside (back faces) too. A plane needs it to be seen from behind. */
  doubleSided: z.boolean().default(false),
  /** Show every flat face of the shape separately, instead of blending them into a smooth curve. */
  flatShading: z.boolean().default(false),
  /** How strongly the object shows the reflections of the environment (1 = as set in the scene). */
  reflectionStrength: z.number().min(0).max(MAX_REFLECTION_STRENGTH).default(1),
  /** Does the object throw a shadow? */
  castShadow: z.boolean().default(true),
  /** Do shadows fall on the object? */
  receiveShadow: z.boolean().default(true),
});

export type Material = z.infer<typeof materialSchema>;

/** The surface of a new object. */
export const DEFAULT_MATERIAL: Material = materialSchema.parse({});

/** Most modifiers on one object, and the most segments a shape can be cut into. */
export const MAX_MODIFIERS = 8;
export const MAX_SEGMENTS = 32;

/** The three directions of space; the modifiers work along one of them (the object's own, not the world's). */
export const MODIFIER_AXES = ["x", "y", "z"] as const;
export type ModifierAxis = (typeof MODIFIER_AXES)[number];

/** Limits of the stretch factor and the array modifier. */
export const MIN_STRETCH = 0.1;
export const MAX_MIRROR_OFFSET = 3;
export const MAX_STRETCH = 5;
export const MIN_ARRAY_COUNT = 2;
export const MAX_ARRAY_COUNT = 20;
export const MAX_ARRAY_SPACING = 5;

const modifierBase = {
  id: z.string().min(1),
  /** A switched-off modifier stays in the list but does nothing. */
  enabled: z.boolean().default(true),
  axis: z.enum(MODIFIER_AXES).default("y"),
};

/**
 * A change made to the shape of an object without touching the shape itself: the object keeps its shape
 * and a short list of these, applied in order. Change or remove one at any time.
 * - bend: curves the shape around an arc (angle in degrees, along the axis)
 * - twist: turns each slice more than the one before (angle in degrees from end to end)
 * - taper: makes one end thinner (amount 0 = no change, 1 = a point, below 0 = wider)
 * - stretch: makes the shape longer or shorter along the axis
 * - noise: pushes points around in a smooth, bumpy pattern (the axis does not matter)
 * - mirror: adds a reflected copy on the other side of the middle of the object
 * - array: repeats the shape along the axis
 */
export const modifierSchema = z.discriminatedUnion("type", [
  z.object({
    ...modifierBase,
    type: z.literal("bend"),
    angle: z.number().min(-360).max(360).default(45),
  }),
  z.object({
    ...modifierBase,
    type: z.literal("twist"),
    angle: z.number().min(-720).max(720).default(90),
  }),
  z.object({
    ...modifierBase,
    type: z.literal("taper"),
    amount: z.number().min(-1).max(1).default(0.5),
  }),
  z.object({
    ...modifierBase,
    type: z.literal("stretch"),
    /** 1 = no change; 2 = twice as long along the axis; 0.5 = squashed to half. */
    factor: z.number().min(MIN_STRETCH).max(MAX_STRETCH).default(1.5),
    /** Make the other two directions thinner as it gets longer (and fatter as it gets shorter), like squashy dough. */
    keepVolume: z.boolean().default(false),
  }),
  z.object({
    ...modifierBase,
    type: z.literal("noise"),
    /** How far points are pushed, as a fraction of the size of the shape. */
    strength: z.number().min(0).max(1).default(0.1),
    /** How many bumps: higher is finer and busier. */
    scale: z.number().min(0.1).max(10).default(2),
    /** A different number gives a different, but repeatable, pattern. */
    seed: z.number().int().min(0).max(9999).default(1),
  }),
  z.object({
    ...modifierBase,
    type: z.literal("mirror"),
    /**
     * Where the mirror plane stands along the axis, measured from the middle of the object in lengths of
     * the shape (0 = through the middle, 0.5 = at the side of a centred shape, so the copy sits next to
     * it). A shape that is the same on both sides and mirrored through the middle would just land on itself.
     */
    offset: z
      .number()
      .min(-MAX_MIRROR_OFFSET)
      .max(MAX_MIRROR_OFFSET)
      .default(0.5),
  }),
  z.object({
    ...modifierBase,
    type: z.literal("array"),
    /** How many copies in total (the original included). */
    count: z
      .number()
      .int()
      .min(MIN_ARRAY_COUNT)
      .max(MAX_ARRAY_COUNT)
      .default(3),
    /** Distance between copies, as a multiple of the length of the shape along the axis (1 = touching). */
    spacing: z.number().min(0).max(MAX_ARRAY_SPACING).default(1.2),
  }),
]);

export type Modifier = z.infer<typeof modifierSchema>;
export type ModifierType = Modifier["type"];

/** The settings of a light object. Which ones matter depends on the kind (see `lights.ts`). */
export const lightSchema = z.object({
  color: hexColorSchema.default("#ffffff"),
  /** Strength. What a good number is depends on the kind of light (see `maxLightIntensity`). */
  intensity: z.number().min(0).max(1000).default(1),
  /** Point and spot: how far the light reaches (it fades out towards this distance). 0 = no limit. */
  range: z.number().min(0).max(1000).default(0),
  /** Spot: half the width of the cone, in degrees. */
  angle: z.number().min(1).max(85).default(40),
  /** Spot: how soft the edge of the cone is, 0 (sharp) to 1 (soft). */
  penumbra: z.number().min(0).max(1).default(0.3),
  castShadow: z.boolean().default(true),
});

export type LightSettings = z.infer<typeof lightSchema>;

export const sceneNodeObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(NODE_NAME_MAX_LENGTH),
  kind: z.enum(NODE_KINDS),
  /** null = top level of the scene. Children follow their parent's transform. */
  parentId: z.string().min(1).nullable(),
  visible: z.boolean(),
  /**
   * A locked object cannot be edited (moved, renamed, recoloured, deleted, re-parented). Old scenes
   * saved before this field existed load as unlocked.
   */
  locked: z.boolean().default(false),
  transform: transformSchema,
  /** CSS hex colour such as "#ff8800". */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /**
   * How finely the shape is cut up (1 = the plain shape). Bending and twisting need more pieces to curve
   * smoothly. Only the built-in shapes use it. Older scenes load with 1.
   */
  segments: z.number().int().min(1).max(MAX_SEGMENTS).default(1),
  /** The shape changes (bend, twist, taper), applied in order. Older scenes load with none. */
  modifiers: z.array(modifierSchema).max(MAX_MODIFIERS).default([]),
  /** Only for the light kinds: how the light shines. null for every other object. Older scenes load with null. */
  light: lightSchema.nullable().default(null),
  /** The surface values. Scenes saved before this section existed had `roughness` and `metalness` on the node itself. */
  material: materialSchema.default(DEFAULT_MATERIAL),
  /**
   * For a "model" or a "mesh": the id of its data (a key of `scene.assets`). The data itself (an imported
   * file, or the points and triangles of the mesh) is stored apart from the scene, because it can be many
   * megabytes. null for the built-in shapes and lights.
   */
  assetId: z.string().min(1).nullable().default(null),
  /**
   * The place among the objects that share this parent: smaller numbers come first, and objects with
   * the same number keep the order they were created in. Old scenes without it load as 0 for every
   * object, which means "in creation order", as before.
   */
  order: z.number().default(0),
});

/**
 * Reads a saved object, including the older shape where `roughness` and `metalness` sat on the object
 * itself (they move into `material`). A plane saved before "double-sided" existed was always drawn
 * from both sides, so it loads double-sided.
 */
function migrateLegacyMaterial(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const node = raw as Record<string, unknown>;
  const { roughness, metalness, ...rest } = node;
  const hasLegacy = roughness !== undefined || metalness !== undefined;
  if (node["material"] !== undefined && !hasLegacy) return raw;
  if (node["material"] !== undefined) return rest;
  const material: Record<string, unknown> = {};
  if (roughness !== undefined) material["roughness"] = roughness;
  if (metalness !== undefined) material["metalness"] = metalness;
  if (node["kind"] === "plane") material["doubleSided"] = true;
  return { ...rest, material };
}

/** One object of the scene. Runs the older-shape migration before checking the fields. */
export const sceneNodeSchema = z.preprocess(
  migrateLegacyMaterial,
  sceneNodeObjectSchema,
);

/**
 * What the scene remembers about an imported file. The file's bytes live in asset storage, under the
 * same `id` (a hash of the bytes, so importing the same file twice stores it once).
 */
export const assetInfoSchema = z.object({
  id: z.string().min(1),
  /** Shown in the Inspector; from the file name. */
  name: z.string().min(1).max(NODE_NAME_MAX_LENGTH),
  /** "model": an imported GLB file. "mesh": the points and triangles of an editable mesh made in the editor. */
  type: z.enum(["model", "mesh"]),
  bytes: z.number().int().nonnegative(),
  triangles: z.number().int().nonnegative(),
  /** Corners of the box around the model, in the model's own units, measured when it was imported. */
  boundsMin: vec3Schema,
  boundsMax: vec3Schema,
  /** Where the file came from and its licence ("CC-BY, by Jane, sketchfab.com/..."). Old scenes load with none. */
  note: z.string().max(ASSET_NOTE_MAX_LENGTH).default(""),
});

/**
 * The world around the objects: what is behind them, what they reflect, fog, and the always-on
 * lights. Every field has a default, so older scenes (without it) load with the starting look.
 */
export const environmentSchema = z.object({
  /** What is drawn behind everything: one colour, or a sky that fades from the top, through the horizon, to the ground. */
  backgroundMode: z.enum(["color", "sky"]).default("color"),
  backgroundColor: hexColorSchema.default("#14191d"),
  skyTop: hexColorSchema.default("#3f6fb5"),
  skyHorizon: hexColorSchema.default("#bcd6ea"),
  skyGround: hexColorSchema.default("#3a3f45"),
  /**
   * What shiny surfaces reflect, and what lights them from all sides: nothing, a generated "studio"
   * (a bright room with soft light boxes), or the sky above.
   */
  reflections: z.enum(["off", "studio", "sky"]).default("studio"),
  /** How strong that reflected light is. */
  reflectionStrength: z.number().min(0).max(5).default(0.6),
  fogEnabled: z.boolean().default(false),
  fogColor: hexColorSchema.default("#14191d"),
  /** Fog starts this far from the camera and is complete at `fogFar`. */
  fogNear: z.number().min(0).max(1000).default(10),
  fogFar: z.number().min(1).max(2000).default(60),
  /** The soft light that comes from everywhere. */
  ambientIntensity: z.number().min(0).max(5).default(0.6),
  /** The built-in sun: switched off, or its strength and direction (degrees). */
  sunEnabled: z.boolean().default(true),
  sunIntensity: z.number().min(0).max(10).default(1.6),
  /** Which compass direction the sun stands in, 0 to 360. */
  sunAzimuth: z.number().min(0).max(360).default(51),
  /** How high the sun is, 0 (on the horizon) to 90 (straight above). */
  sunElevation: z.number().min(0).max(90).default(51),
});

export type EnvironmentSettings = z.infer<typeof environmentSchema>;

/** The starting environment. */
export const DEFAULT_ENVIRONMENT: EnvironmentSettings = environmentSchema.parse(
  {},
);

/**
 * Flat map of nodes by id (not a nested tree). A flat map is easier to update,
 * and maps cleanly onto a Yjs document later. The tree is rebuilt from parentId.
 */
export const sceneSchema = z.object({
  version: z.literal(SCENE_SCHEMA_VERSION),
  nodes: z.record(z.string(), sceneNodeSchema),
  /** Imported files used by the scene, by id. Old scenes without it load with none. */
  assets: z.record(z.string(), assetInfoSchema).default({}),
  /** The world around the objects. Older scenes without it load with the starting look. */
  environment: environmentSchema.default(DEFAULT_ENVIRONMENT),
});

export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];
export type LightKind = (typeof LIGHT_KINDS)[number];
export type NodeKind = (typeof NODE_KINDS)[number];
export type AssetInfo = z.infer<typeof assetInfoSchema>;
export type Transform = z.infer<typeof transformSchema>;
export type SceneNode = z.infer<typeof sceneNodeObjectSchema>;
export type Scene = z.infer<typeof sceneSchema>;

export function createEmptyScene(): Scene {
  return {
    version: SCENE_SCHEMA_VERSION,
    nodes: {},
    assets: {},
    environment: { ...DEFAULT_ENVIRONMENT },
  };
}
