import { z } from "zod";
import { checkGlbBytes } from "./assets";
import { decodeMeshData } from "./meshData";
import { pruneUnusedMeshAssets } from "./meshOps";
import { isPngBytes } from "./paint";
import { parseSavedScene } from "./persistence";
import type { Scene } from "./scene";
import { createProject, parseProject, type Project } from "./project";

/**
 * Text to bytes and back. Browsers and Node both have these, but this package is built without either's
 * type library (it also runs on the server), so they are reached through a small typed wrapper.
 */
const text = globalThis as unknown as {
  TextEncoder: new () => { encode(input: string): Uint8Array };
  TextDecoder: new (
    label?: string,
    options?: { fatal?: boolean },
  ) => { decode(input: Uint8Array): string };
};

/**
 * The SceneRoom file: a whole project (all its scenes) and the model and mesh files they use, in one file
 * you can keep, send and open again.
 *
 * Layout (all numbers little-endian, like a GLB file):
 *   bytes 0 to 3    the letters "SCNR" (so a wrong file is noticed at once)
 *   bytes 4 to 7    the version of this layout (a whole number)
 *   bytes 8 to 11   N, the length of the header in bytes
 *   next N bytes    the header: JSON text (UTF-8). Version 2: { project, assets }. Version 1 (one scene,
 *                   from before projects): { scene, assets }. `assets` is the list of files
 *                   ({ id, bytes }, in the order they follow)
 *   after that      the files, one after the other, each as long as the list says. A file used by
 *                   several scenes is in the file ONCE.
 *
 * Files are not put inside the JSON (as text they would grow by a third and be slow to read).
 */
export const SCENE_FILE_MAGIC = "SCNR";
export const SCENE_FILE_VERSION = 2;
export const SCENE_FILE_EXTENSION = ".sceneroom";

/** Largest file that is opened. A bigger one is refused with a clear message, before it is read. */
export const MAX_SCENE_FILE_BYTES = 250 * 1024 * 1024;

/** The fixed part at the start: letters, version and header length. */
const PREAMBLE_BYTES = 12;

/** The id given to the one scene of a version 1 file (those files have no scene ids). */
export const LEGACY_FILE_SCENE_ID = "scene-1";

const assetListSchema = z.array(
  z.object({
    id: z.string().min(1),
    bytes: z.number().int().nonnegative(),
  }),
);

const headerSchemaV1 = z.object({
  scene: z.unknown(),
  assets: assetListSchema,
});
const headerSchemaV2 = z.object({
  project: z.unknown(),
  assets: assetListSchema,
});

/** What was packed, and which files the scenes mention that could not be included. */
export type EncodedSceneFile = { bytes: Uint8Array; missing: string[] };

/**
 * Packs a project and the files its scenes use. `assets` maps a file id to its bytes; a file a scene
 * mentions but that is not in `assets` is left out and listed in `missing` (its objects will show as
 * missing placeholders when the file is opened). Files in `assets` that no scene mentions are not packed.
 * A file used by several scenes is packed once.
 */
export function encodeProjectFile(
  fullProject: Project,
  assets: Readonly<Record<string, Uint8Array>>,
): EncodedSceneFile {
  // A mesh that no object uses any more (only kept in memory so that Undo can bring it back) is not saved
  const project: Project = {
    ...fullProject,
    scenes: fullProject.scenes.map((s) => ({
      ...s,
      scene: pruneUnusedMeshAssets(s.scene),
    })),
  };
  const wanted = projectAssetIds(project);
  const included: { id: string; data: Uint8Array }[] = [];
  const missing: string[] = [];
  for (const id of wanted) {
    const data = assets[id];
    if (data) included.push({ id, data });
    else missing.push(id);
  }

  const header = new text.TextEncoder().encode(
    JSON.stringify({
      project,
      assets: included.map(({ id, data }) => ({ id, bytes: data.length })),
    }),
  );
  const total =
    PREAMBLE_BYTES +
    header.length +
    included.reduce((sum, { data }) => sum + data.length, 0);

  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  bytes.set(new text.TextEncoder().encode(SCENE_FILE_MAGIC), 0);
  view.setUint32(4, SCENE_FILE_VERSION, true);
  view.setUint32(8, header.length, true);
  bytes.set(header, PREAMBLE_BYTES);
  let offset = PREAMBLE_BYTES + header.length;
  for (const { data } of included) {
    bytes.set(data, offset);
    offset += data.length;
  }
  return { bytes, missing };
}

/** The ids of every file the scenes of a project use, each once, in the order first met. */
export function projectAssetIds(project: Project): string[] {
  const ids = new Set<string>();
  for (const { scene } of project.scenes) {
    for (const id of Object.keys(scene.assets)) ids.add(id);
  }
  for (const prefab of Object.values(project.prefabs)) {
    for (const asset of prefab.assets) ids.add(asset.id);
  }
  return [...ids];
}

export type DecodedProjectFile =
  | { ok: true; project: Project; assets: Record<string, Uint8Array> }
  | { ok: false; reason: string };

const fail = (reason: string): DecodedProjectFile => ({ ok: false, reason });

/**
 * Reads a SceneRoom file. The file is outside data, so every part is checked: the letters, the version,
 * that the lengths fit, the header, the project and every scene in it (with the same checks as the
 * project saved in the browser), and that each file is a real GLB or mesh. Nothing is trusted: the first
 * thing wrong is reported in plain words. Whether each file's id matches its contents is checked by the
 * caller (it needs a hash). A version 1 file (one scene) opens as a project with one scene.
 */
export function decodeProjectFile(bytes: Uint8Array): DecodedProjectFile {
  if (bytes.length > MAX_SCENE_FILE_BYTES) {
    return fail(
      `This file is ${megabytes(bytes.length)} MB; the limit is ${megabytes(MAX_SCENE_FILE_BYTES)} MB.`,
    );
  }
  if (bytes.length < PREAMBLE_BYTES) {
    return fail("This is not a SceneRoom file (it is too small).");
  }
  const magic = new text.TextDecoder().decode(bytes.subarray(0, 4));
  if (magic !== SCENE_FILE_MAGIC) {
    return fail("This is not a SceneRoom file.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version > SCENE_FILE_VERSION) {
    return fail(
      `This file was saved by a newer version of SceneRoom (file version ${version}; this one reads up to ${SCENE_FILE_VERSION}). Update the app and try again.`,
    );
  }
  if (version < 1) return fail("This is not a SceneRoom file (bad version).");

  const headerLength = view.getUint32(8, true);
  if (headerLength === 0 || PREAMBLE_BYTES + headerLength > bytes.length) {
    return fail("The file is damaged (its header does not fit).");
  }

  let headerJson: unknown;
  try {
    headerJson = JSON.parse(
      new text.TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(PREAMBLE_BYTES, PREAMBLE_BYTES + headerLength),
      ),
    );
  } catch {
    return fail("The file is damaged (its header cannot be read).");
  }

  let project: Project;
  let list: z.infer<typeof assetListSchema>;
  if (version === 1) {
    const header = headerSchemaV1.safeParse(headerJson);
    if (!header.success) {
      return fail("The file is damaged (its header has the wrong shape).");
    }
    const parsed = parseSavedScene(header.data.scene);
    if (!parsed.ok) {
      return fail(`The scene in this file is not valid: ${parsed.reason}.`);
    }
    project = createProject(LEGACY_FILE_SCENE_ID, parsed.scene);
    list = header.data.assets;
  } else {
    const header = headerSchemaV2.safeParse(headerJson);
    if (!header.success) {
      return fail("The file is damaged (its header has the wrong shape).");
    }
    const parsed = parseProject(header.data.project);
    if (!parsed.ok) {
      return fail(`The project in this file is not valid: ${parsed.reason}.`);
    }
    project = parsed.project;
    list = header.data.assets;
  }

  // What each file is, from the first scene that uses it
  const infoById = new Map<string, Scene["assets"][string]>();
  for (const { scene } of project.scenes) {
    for (const [id, info] of Object.entries(scene.assets)) {
      if (!infoById.has(id)) infoById.set(id, info);
    }
  }
  for (const prefab of Object.values(project.prefabs)) {
    for (const info of prefab.assets) {
      if (!infoById.has(info.id)) infoById.set(info.id, info);
    }
  }

  const seen = new Set<string>();
  let offset = PREAMBLE_BYTES + headerLength;
  const assets: Record<string, Uint8Array> = {};
  for (const entry of list) {
    if (seen.has(entry.id)) {
      return fail("The file is damaged (a model file is listed twice).");
    }
    seen.add(entry.id);
    if (offset + entry.bytes > bytes.length) {
      return fail("The file is cut short (a model file is missing its data).");
    }
    // A copy, so the result does not depend on the buffer the file was read into
    const data = bytes.slice(offset, offset + entry.bytes);
    offset += entry.bytes;
    // Only files a scene really uses are taken
    const info = infoById.get(entry.id);
    if (!info) continue;
    const problem = checkAssetBytes(info.type, data);
    if (problem) {
      const what = info.type;
      return fail(
        `The ${what} "${info.name}" in this file is not usable: ${problem}`,
      );
    }
    assets[entry.id] = data;
  }
  if (offset !== bytes.length) {
    return fail("The file is damaged (it has data after the end).");
  }
  return { ok: true, project, assets };
}

/** What is wrong with the stored bytes of a model (a GLB file) or a mesh, or null if they are fine. */
function checkAssetBytes(
  type: "model" | "mesh" | "texture",
  data: Uint8Array,
): string | null {
  if (type === "texture") {
    return isPngBytes(data) ? null : "it is not a PNG picture.";
  }
  if (type === "mesh") {
    const mesh = decodeMeshData(data);
    return mesh.ok ? null : mesh.reason;
  }
  const check = checkGlbBytes(data);
  return check.ok ? null : check.reason;
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * A name made safe to use in a file name: letters, digits and dashes ("Town (2)" becomes "town-2").
 * Falls back to `fallback` when nothing is left (a name made of symbols).
 */
export function fileSafeName(name: string, fallback = "scene"): string {
  const clean = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean === "" ? fallback : clean.slice(0, 40);
}

/** The date as it is written in file names: "2026-11-14". */
export function fileDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A file name for a saved project or scene: "my-town-2026-11-14.sceneroom". */
export function sceneFileName(date: Date = new Date(), name = "scene"): string {
  return `${fileSafeName(name)}-${fileDate(date)}${SCENE_FILE_EXTENSION}`;
}
