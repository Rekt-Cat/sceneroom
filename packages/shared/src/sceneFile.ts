import { z } from "zod";
import { checkGlbBytes } from "./assets";
import { parseSavedScene } from "./persistence";
import type { Scene } from "./scene";

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
 * The SceneRoom file: a scene and the model files it uses, in one file you can keep, send and open again.
 *
 * Layout (all numbers little-endian, like a GLB file):
 *   bytes 0 to 3    the letters "SCNR" (so a wrong file is noticed at once)
 *   bytes 4 to 7    the version of this layout (a whole number)
 *   bytes 8 to 11   N, the length of the header in bytes
 *   next N bytes    the header: JSON text (UTF-8) with the scene and a list of the model files
 *                   ({ id, bytes }, in the order they follow)
 *   after that      the model files, one after the other, each as long as the list says
 *
 * Model files are not put inside the JSON (as text they would grow by a third and be slow to read).
 */
export const SCENE_FILE_MAGIC = "SCNR";
export const SCENE_FILE_VERSION = 1;
export const SCENE_FILE_EXTENSION = ".sceneroom";

/** Largest file that is opened. A bigger one is refused with a clear message, before it is read. */
export const MAX_SCENE_FILE_BYTES = 250 * 1024 * 1024;

/** The fixed part at the start: letters, version and header length. */
const PREAMBLE_BYTES = 12;

const headerSchema = z.object({
  scene: z.unknown(),
  assets: z.array(
    z.object({
      id: z.string().min(1),
      bytes: z.number().int().nonnegative(),
    }),
  ),
});

/** What was packed, and which model files the scene mentions that could not be included. */
export type EncodedSceneFile = { bytes: Uint8Array; missing: string[] };

/**
 * Packs a scene and its model files. `assets` maps a file id to its bytes; a file the scene mentions
 * but that is not in `assets` is left out and listed in `missing` (its objects will show as missing
 * placeholders when the file is opened). Files in `assets` that the scene does not mention are not packed.
 */
export function encodeSceneFile(
  scene: Scene,
  assets: Readonly<Record<string, Uint8Array>>,
): EncodedSceneFile {
  const included: { id: string; data: Uint8Array }[] = [];
  const missing: string[] = [];
  for (const id of Object.keys(scene.assets)) {
    const data = assets[id];
    if (data) included.push({ id, data });
    else missing.push(id);
  }

  const header = new text.TextEncoder().encode(
    JSON.stringify({
      scene,
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

export type DecodedSceneFile =
  | { ok: true; scene: Scene; assets: Record<string, Uint8Array> }
  | { ok: false; reason: string };

const fail = (reason: string): DecodedSceneFile => ({ ok: false, reason });

/**
 * Reads a SceneRoom file. The file is outside data, so every part is checked: the letters, the version,
 * that the lengths fit, the header, the scene (with the same checks as the saved scene in the browser),
 * and that each model file is a real GLB. Nothing is trusted: the first thing wrong is reported in plain
 * words. Whether each file's id matches its contents is checked by the caller (it needs a hash).
 */
export function decodeSceneFile(bytes: Uint8Array): DecodedSceneFile {
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
  const header = headerSchema.safeParse(headerJson);
  if (!header.success) {
    return fail("The file is damaged (its header has the wrong shape).");
  }

  const parsed = parseSavedScene(header.data.scene);
  if (!parsed.ok) {
    return fail(`The scene in this file is not valid: ${parsed.reason}.`);
  }

  const seen = new Set<string>();
  let offset = PREAMBLE_BYTES + headerLength;
  const assets: Record<string, Uint8Array> = {};
  for (const entry of header.data.assets) {
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
    // Only files the scene really uses are taken
    if (!parsed.scene.assets[entry.id]) continue;
    const check = checkGlbBytes(data);
    if (!check.ok) {
      const name = parsed.scene.assets[entry.id]?.name ?? entry.id;
      return fail(
        `The model "${name}" in this file is not usable: ${check.reason}`,
      );
    }
    assets[entry.id] = data;
  }
  if (offset !== bytes.length) {
    return fail("The file is damaged (it has data after the end).");
  }
  return { ok: true, scene: parsed.scene, assets };
}

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** A file name for a saved scene, from today's date: "scene-2026-11-14.sceneroom". */
export function sceneFileName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `scene-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}${SCENE_FILE_EXTENSION}`;
}
