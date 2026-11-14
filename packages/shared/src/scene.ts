import { z } from "zod";

/** Bump when the saved scene shape changes, so old files can be migrated. */
export const SCENE_SCHEMA_VERSION = 1;

export const NODE_NAME_MAX_LENGTH = 100;

/** The colour of a new object (a light blue). */
export const DEFAULT_COLOR = "#5cc4e0";

/** How shiny and how metal a new object looks. 0 to 1: roughness 0 is a mirror, 1 is chalk; metalness 1 is bare metal. */
export const DEFAULT_ROUGHNESS = 0.6;
export const DEFAULT_METALNESS = 0.1;

export const PRIMITIVE_KINDS = [
  "cube",
  "sphere",
  "cylinder",
  "plane",
  "cone",
] as const;

/** Every kind of object: the built-in shapes, and "model" for a file imported from outside (see `assetId`). */
export const NODE_KINDS = [...PRIMITIVE_KINDS, "model"] as const;

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

/** Rotation is Euler angles in radians (x, y, z), like Three.js. */
export const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema,
});

export const sceneNodeSchema = z.object({
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
  /** Surface finish, 0 (smooth, shiny) to 1 (rough, matte). Old scenes without it load with the default. */
  roughness: z.number().min(0).max(1).default(DEFAULT_ROUGHNESS),
  /** 0 (plastic, wood, stone) to 1 (metal). Old scenes without it load with the default. */
  metalness: z.number().min(0).max(1).default(DEFAULT_METALNESS),
  /**
   * For a "model": the id of the imported file (a key of `scene.assets`). The file itself is stored
   * apart from the scene, because it can be many megabytes. null for the built-in shapes.
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
 * What the scene remembers about an imported file. The file's bytes live in asset storage, under the
 * same `id` (a hash of the bytes, so importing the same file twice stores it once).
 */
export const assetInfoSchema = z.object({
  id: z.string().min(1),
  /** Shown in the Inspector; from the file name. */
  name: z.string().min(1).max(NODE_NAME_MAX_LENGTH),
  type: z.literal("model"),
  bytes: z.number().int().nonnegative(),
  triangles: z.number().int().nonnegative(),
  /** Corners of the box around the model, in the model's own units, measured when it was imported. */
  boundsMin: vec3Schema,
  boundsMax: vec3Schema,
});

/**
 * Flat map of nodes by id (not a nested tree). A flat map is easier to update,
 * and maps cleanly onto a Yjs document later. The tree is rebuilt from parentId.
 */
export const sceneSchema = z.object({
  version: z.literal(SCENE_SCHEMA_VERSION),
  nodes: z.record(z.string(), sceneNodeSchema),
  /** Imported files used by the scene, by id. Old scenes without it load with none. */
  assets: z.record(z.string(), assetInfoSchema).default({}),
});

export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];
export type NodeKind = (typeof NODE_KINDS)[number];
export type AssetInfo = z.infer<typeof assetInfoSchema>;
export type Transform = z.infer<typeof transformSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export type Scene = z.infer<typeof sceneSchema>;

export function createEmptyScene(): Scene {
  return { version: SCENE_SCHEMA_VERSION, nodes: {}, assets: {} };
}
