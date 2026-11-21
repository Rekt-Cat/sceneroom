import type { ShapeMesh } from "./modifiers";

/**
 * A mesh stored as the DIFFERENCE from an earlier mesh (difference-based undo, see docs/editor/UVS-AND-SEAMS.md). When an edit
 * only moves points (a sculpt stroke, a move of a big selection) the triangles, creases, seams and map stay as they
 * were, so only the changed points need to be kept: their numbers and new positions.
 */
export type MeshPatch = {
  /** The id of the mesh this one is a change of. */
  baseId: string;
  /** How many patches lie between this mesh and a whole stored mesh (0 for the first patch on a whole mesh, plus one each time). */
  depth: number;
  /** How many points the mesh has (the same as the base). */
  pointCount: number;
  /** The numbers of the points that moved, rising. */
  changed: Uint32Array;
  /** Their new positions: x, y, z for each changed point. */
  positions: Float32Array;
};

/** A patch is only worth keeping while it is smaller than this share of the points; beyond it a whole mesh is stored. */
export const MAX_PATCH_SHARE = 0.5;

const sameNumbers = (
  a: ArrayLike<number> | undefined,
  b: ArrayLike<number> | undefined,
): boolean => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * What `next` changed compared with `base`, as a patch, or null if it cannot be one: the triangles, creases, seams or
 * map differ, the point count differs, or more than `MAX_PATCH_SHARE` of the points moved (then a whole mesh is smaller).
 * `depthOfBase` is how deep the base itself is; the patch is one deeper.
 */
export function diffMeshes(
  base: ShapeMesh,
  next: ShapeMesh,
  baseId: string,
  depthOfBase: number,
): MeshPatch | null {
  if (base.positions.length !== next.positions.length) return null;
  if (!sameNumbers(base.indices, next.indices)) return null;
  if (!sameNumbers(base.uvs, next.uvs)) return null;
  if (JSON.stringify(base.creases ?? []) !== JSON.stringify(next.creases ?? []))
    return null;
  if (JSON.stringify(base.seams ?? []) !== JSON.stringify(next.seams ?? []))
    return null;
  const pointCount = base.positions.length / 3;
  const changed: number[] = [];
  for (let p = 0; p < pointCount; p++) {
    if (
      base.positions[p * 3] !== next.positions[p * 3] ||
      base.positions[p * 3 + 1] !== next.positions[p * 3 + 1] ||
      base.positions[p * 3 + 2] !== next.positions[p * 3 + 2]
    ) {
      changed.push(p);
    }
  }
  if (changed.length > pointCount * MAX_PATCH_SHARE) return null;
  const positions = new Float32Array(changed.length * 3);
  changed.forEach((p, i) => {
    positions.set(next.positions.subarray(p * 3, p * 3 + 3), i * 3);
  });
  return {
    baseId,
    depth: depthOfBase + 1,
    pointCount,
    changed: Uint32Array.from(changed),
    positions,
  };
}

/** The mesh a patch makes from its base. The base is not changed; triangles, creases, seams and map are shared with it. */
export function applyMeshPatch(base: ShapeMesh, patch: MeshPatch): ShapeMesh {
  const positions = new Float32Array(base.positions);
  patch.changed.forEach((p, i) => {
    positions.set(patch.positions.subarray(i * 3, i * 3 + 3), p * 3);
  });
  return { ...base, positions };
}

// ---- Stored form ----

/** The first four letters of a stored patch (a whole mesh starts with "SRMH"). */
export const PATCH_MAGIC = "SRMP";
export const PATCH_FORMAT_VERSION = 1;
const FIXED_BYTES = 4 + 4 + 4 + 4 + 4 + 4; // letters, version, depth, point count, changed count, base id length

/** True if the bytes start like a stored patch. */
export function isMeshPatchBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) ===
      PATCH_MAGIC
  );
}

/** Writes a patch as bytes: fixed numbers, the base id as text, the changed point numbers, then their positions. */
export function encodeMeshPatch(patch: MeshPatch): Uint8Array {
  const id = Uint8Array.from(patch.baseId, (c) => c.charCodeAt(0) & 0xff);
  const count = patch.changed.length;
  const bytes = new Uint8Array(
    FIXED_BYTES + id.length + count * 4 + count * 12,
  );
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = PATCH_MAGIC.charCodeAt(i);
  view.setUint32(4, PATCH_FORMAT_VERSION, true);
  view.setUint32(8, patch.depth, true);
  view.setUint32(12, patch.pointCount, true);
  view.setUint32(16, count, true);
  view.setUint32(20, id.length, true);
  bytes.set(id, FIXED_BYTES);
  let at = FIXED_BYTES + id.length;
  for (let i = 0; i < count; i++, at += 4)
    view.setUint32(at, patch.changed[i]!, true);
  for (let i = 0; i < count * 3; i++, at += 4)
    view.setFloat32(at, patch.positions[i]!, true);
  return bytes;
}

export type DecodedPatch =
  { ok: true; patch: MeshPatch } | { ok: false; reason: string };

/** Longest base id accepted (a SHA-256 in hex is 64 letters). */
const MAX_ID_LENGTH = 128;

/** Reads stored patch bytes. Everything is checked (sizes fit exactly, numbers are finite and in range, point numbers rise). */
export function decodeMeshPatch(bytes: Uint8Array): DecodedPatch {
  if (bytes.length < FIXED_BYTES || !isMeshPatchBytes(bytes)) {
    return { ok: false, reason: "This is not a stored mesh change." };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version !== PATCH_FORMAT_VERSION) {
    return {
      ok: false,
      reason: `Unknown version ${version} of a stored mesh change.`,
    };
  }
  const depth = view.getUint32(8, true);
  const pointCount = view.getUint32(12, true);
  const count = view.getUint32(16, true);
  const idLength = view.getUint32(20, true);
  if (idLength === 0 || idLength > MAX_ID_LENGTH || count > pointCount) {
    return { ok: false, reason: "The stored mesh change is damaged." };
  }
  if (bytes.length !== FIXED_BYTES + idLength + count * 16) {
    return { ok: false, reason: "The stored mesh change has the wrong size." };
  }
  const baseId = String.fromCharCode(
    ...bytes.subarray(FIXED_BYTES, FIXED_BYTES + idLength),
  );
  let at = FIXED_BYTES + idLength;
  const changed = new Uint32Array(count);
  for (let i = 0; i < count; i++, at += 4) {
    const p = view.getUint32(at, true);
    if (p >= pointCount || (i > 0 && p <= changed[i - 1]!)) {
      return { ok: false, reason: "The stored mesh change names a bad point." };
    }
    changed[i] = p;
  }
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++, at += 4) {
    const value = view.getFloat32(at, true);
    if (!Number.isFinite(value)) {
      return {
        ok: false,
        reason: "The stored mesh change has a number that is not finite.",
      };
    }
    positions[i] = value;
  }
  return { ok: true, patch: { baseId, depth, pointCount, changed, positions } };
}
