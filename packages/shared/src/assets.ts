import { NODE_NAME_MAX_LENGTH, type AssetInfo } from "./scene";

/** Largest model file accepted (bytes). Bigger files are refused with a clear message. */
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;

/** Most triangles a model may have. Beyond this the browser gets slow, so the import is refused. */
export const MAX_MODEL_TRIANGLES = 500_000;

/** A newly imported model is scaled so its longest side is this many units (a car may come in as 4 or as 4000). */
export const TARGET_IMPORT_SIZE = 4;

export type FileCheck = { ok: true } | { ok: false; reason: string };

/**
 * Checks that bytes really are a binary glTF file (".glb") by looking at the first 12 bytes, whatever
 * the file is called: the text "glTF", version 2, and a length that fits the file. This is a quick
 * sanity check, not a full validation (the loader does that next).
 */
export function checkGlbBytes(bytes: Uint8Array): FileCheck {
  if (bytes.length < 12) {
    return { ok: false, reason: "The file is too small to be a GLB model." };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // "glTF" as four letters at the start (0x46546C67 when read as a little-endian number)
  if (view.getUint32(0, true) !== 0x46546c67) {
    return {
      ok: false,
      reason: 'This file is not a GLB model (it does not start with "glTF").',
    };
  }
  const version = view.getUint32(4, true);
  if (version !== 2) {
    return {
      ok: false,
      reason: `This GLB uses version ${version} of the format; only version 2 is supported.`,
    };
  }
  const declaredLength = view.getUint32(8, true);
  if (declaredLength > bytes.length) {
    return {
      ok: false,
      reason:
        "The file is cut short (it is smaller than it says it is). Try downloading it again.",
    };
  }
  return { ok: true };
}

/** A model name from a file name: no folder, no extension, trimmed and cut to the allowed length. */
export function assetNameFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const withoutExtension = base.replace(/\.[^.]+$/, "").trim();
  const name = withoutExtension.slice(0, NODE_NAME_MAX_LENGTH).trim();
  return name === "" ? "Model" : name;
}

type Bounds = Pick<AssetInfo, "boundsMin" | "boundsMax">;

/** Size of the box around the model (x, y, z), in the model's own units. */
export function modelSize(info: Bounds): [number, number, number] {
  return [
    info.boundsMax[0] - info.boundsMin[0],
    info.boundsMax[1] - info.boundsMin[1],
    info.boundsMax[2] - info.boundsMin[2],
  ];
}

/**
 * Where the model should sit inside its object so that its origin is the middle of its bottom face:
 * the offset to add to the model's own coordinates. (Models come with their origin anywhere, often not
 * on the ground; this makes "put it at 0, 0, 0" mean "standing on the ground at the middle".)
 */
export function modelOffset(info: Bounds): [number, number, number] {
  // "+ 0" turns a negative zero into a plain zero
  return [
    -(info.boundsMin[0] + info.boundsMax[0]) / 2 + 0,
    -info.boundsMin[1] + 0,
    -(info.boundsMin[2] + info.boundsMax[2]) / 2 + 0,
  ];
}

/**
 * The scale that makes the longest side of the model `target` units. 1 if the model has no size
 * (so a broken file never produces a zero or infinite scale).
 */
export function fitScale(
  info: Bounds,
  target: number = TARGET_IMPORT_SIZE,
): number {
  const longest = Math.max(...modelSize(info));
  return Number.isFinite(longest) && longest > 0 ? target / longest : 1;
}
