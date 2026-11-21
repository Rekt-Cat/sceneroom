import * as Y from "yjs";
import {
  SCENE_SCHEMA_VERSION,
  assetInfoSchema,
  environmentSchema,
  sceneNodeSchema,
  type AssetInfo,
  type Scene,
  type SceneNode,
} from "./scene";

/**
 * A scene as a shared Yjs document (design: docs/backend/COLLABORATION.md, section 4).
 *
 *   nodes        Y.Map  nodeId -> Y.Map of that object's fields
 *                         transform and material are Y.Maps of their own (so two people changing different
 *                         fields do not collide); every other field is one plain value
 *   assets       Y.Map  assetId -> plain record. Add-only: files are never removed from the document.
 *   environment  Y.Map  setting -> plain value
 *
 * Everything here is a plain function of a scene or a document. Nothing touches the editor store.
 */

/** Fields of an object that are a Y.Map of their own. */
const NESTED_FIELDS = ["transform", "material"] as const;

/** Marks a change as made on this machine, so the sync layer can tell it from one that arrived over the network. */
export const LOCAL_ORIGIN = "local";

type PlainRecord = Record<string, unknown>;

/** What was refused while reading a document, so it can be logged. */
export type SceneDocIssue = { where: string; message: string };

function nodesOf(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap("nodes") as Y.Map<Y.Map<unknown>>;
}

function assetsOf(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap("assets");
}

function environmentOf(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap("environment");
}

/** Deep equality for plain values (numbers, strings, booleans, null, arrays, plain objects). */
export function plainEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every(
    (key) =>
      Object.hasOwn(b, key) &&
      plainEqual((a as PlainRecord)[key], (b as PlainRecord)[key]),
  );
}

/** Makes the Y.Map `map` hold exactly `values`, writing only what differs from `before`. */
function writeFields(
  map: Y.Map<unknown>,
  values: PlainRecord,
  before: PlainRecord | undefined,
): void {
  for (const [key, value] of Object.entries(values)) {
    if (before && Object.hasOwn(before, key) && plainEqual(before[key], value))
      continue;
    map.set(key, value);
  }
  if (before) {
    for (const key of Object.keys(before)) {
      if (!Object.hasOwn(values, key)) map.delete(key);
    }
  }
}

/** The fields of an object that are plain values (everything except the nested maps). */
function plainFields(node: SceneNode): PlainRecord {
  const rest: PlainRecord = {};
  for (const [key, value] of Object.entries(node)) {
    if (!(NESTED_FIELDS as readonly string[]).includes(key)) rest[key] = value;
  }
  return rest;
}

/** Writes one object into its Y.Map, only the fields that differ from `before` (all of them if undefined). */
function writeNode(
  map: Y.Map<unknown>,
  node: SceneNode,
  before: SceneNode | undefined,
): void {
  for (const field of NESTED_FIELDS) {
    const existing = map.get(field);
    const nested = existing instanceof Y.Map ? existing : new Y.Map<unknown>();
    if (!(existing instanceof Y.Map)) map.set(field, nested);
    writeFields(
      nested as Y.Map<unknown>,
      node[field] as unknown as PlainRecord,
      existing instanceof Y.Map && before
        ? (before[field] as unknown as PlainRecord)
        : undefined,
    );
  }
  writeFields(map, plainFields(node), before && plainFields(before));
}

/**
 * Writes a whole scene into an empty (or any) document. Used when a scene is first shared. Existing content is
 * overwritten field by field, nothing is removed except objects that are not in the scene.
 */
export function writeSceneToDoc(
  doc: Y.Doc,
  scene: Scene,
  origin: unknown = LOCAL_ORIGIN,
): void {
  applySceneChange(doc, emptySceneFor(doc), scene, origin);
}

/** A stand-in "previous scene" equal to what the document holds, used to write a whole scene. */
function emptySceneFor(doc: Y.Doc): Scene {
  const { scene } = readSceneFromDoc(doc);
  return scene;
}

/**
 * Changes the document from `previous` to `next`, writing only what differs, in one transaction (so one network
 * update and one event for everybody). `previous` must be what this machine last wrote or read.
 *
 * - objects that are gone from `next` are deleted; new ones are created; changed ones get only their changed fields
 * - files (assets) are add-only: an asset missing from `next` stays in the document
 * - a field that did not change is not written, so two people changing different fields never collide
 */
export function applySceneChange(
  doc: Y.Doc,
  previous: Scene,
  next: Scene,
  origin: unknown = LOCAL_ORIGIN,
): void {
  if (previous === next) return;
  doc.transact(() => {
    const nodes = nodesOf(doc);
    for (const id of Object.keys(previous.nodes)) {
      if (!(id in next.nodes)) nodes.delete(id);
    }
    for (const [id, node] of Object.entries(next.nodes)) {
      const before = previous.nodes[id];
      if (before === node) continue;
      const existing = nodes.get(id);
      if (existing) {
        writeNode(existing, node, before);
      } else {
        const map = new Y.Map<unknown>();
        nodes.set(id, map);
        writeNode(map, node, undefined);
      }
    }

    const assets = assetsOf(doc);
    for (const [id, info] of Object.entries(next.assets)) {
      if (previous.assets[id] === info) continue;
      if (!plainEqual(previous.assets[id], info)) assets.set(id, info);
    }

    if (previous.environment !== next.environment) {
      writeFields(
        environmentOf(doc),
        next.environment as unknown as PlainRecord,
        previous.environment as unknown as PlainRecord,
      );
    }
  }, origin);
}

/** Reads one object. null if it is not in the document or its data is not a valid object. */
export function readNodeFromDoc(
  doc: Y.Doc,
  id: string,
  issues: SceneDocIssue[] = [],
): SceneNode | null {
  const map = nodesOf(doc).get(id);
  if (!map) return null;
  const parsed = sceneNodeSchema.safeParse(map.toJSON());
  if (parsed.success) return parsed.data;
  issues.push({
    where: `nodes/${id}`,
    message: parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; "),
  });
  return null;
}

/**
 * Reads the whole scene out of a document. Everything is checked with the scene schemas, because the data may
 * have come from another machine: an object, file or setting that does not pass is left out and reported in
 * `issues` (for the log), it never reaches the editor.
 */
export function readSceneFromDoc(doc: Y.Doc): {
  scene: Scene;
  issues: SceneDocIssue[];
} {
  const issues: SceneDocIssue[] = [];
  const nodes: Scene["nodes"] = {};
  for (const id of nodesOf(doc).keys()) {
    const node = readNodeFromDoc(doc, id, issues);
    if (!node) continue;
    // The id inside the object must be its key, or a peer could make two objects answer to one id
    if (node.id !== id) {
      issues.push({
        where: `nodes/${id}`,
        message: `id "${node.id}" does not match its key`,
      });
      continue;
    }
    nodes[id] = node;
  }

  const assets: Record<string, AssetInfo> = {};
  for (const [id, value] of assetsOf(doc).entries()) {
    const parsed = assetInfoSchema.safeParse(value);
    if (parsed.success && parsed.data.id === id) {
      assets[id] = parsed.data;
    } else {
      issues.push({
        where: `assets/${id}`,
        message: "not a valid file record",
      });
    }
  }

  const environment = environmentSchema.safeParse(environmentOf(doc).toJSON());
  if (!environment.success) {
    issues.push({
      where: "environment",
      message: "not valid, the starting look is used",
    });
  }
  return {
    scene: {
      version: SCENE_SCHEMA_VERSION,
      nodes,
      assets,
      environment: environment.success
        ? environment.data
        : environmentSchema.parse({}),
    },
    issues,
  };
}
