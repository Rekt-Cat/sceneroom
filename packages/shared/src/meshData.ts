import { MAX_CREASES, checkCreases, type Crease } from "./creases";
import type { ShapeMesh } from "./modifiers";

/**
 * The stored form of an editable mesh: its points and triangles as raw bytes, kept apart from the scene
 * (a mesh can be hundreds of thousands of points, far too big for the scene's JSON or the undo history).
 * Normals are not stored: they are worked out from the triangles when the mesh is shown.
 *
 * Layout (numbers little-endian, like the rest of our files):
 *   bytes 0 to 3     the letters "SRMH"
 *   bytes 4 to 7     version of this layout (now 1)
 *   bytes 8 to 11    P, the number of points
 *   bytes 12 to 15   I, the number of triangle corners (3 per triangle)
 *   next P * 12      the points: x, y, z as 32-bit floats
 *   next I * 4       the corners: point numbers as 32-bit whole numbers
 *
 * Version 2 adds edge creases (see creases.ts) and is only written for a mesh that has some, so a mesh without
 * them keeps its version 1 bytes (and its fingerprint):
 *   bytes 16 to 19   C, the number of creases
 *   after the corners:  C * 4 first points, C * 4 second points (32-bit whole numbers), then C * 1 values
 *                       (0 to 255 for 0 to 1)
 *
 * A mesh is stored under the fingerprint (SHA-256) of exactly these bytes, so the same mesh is stored once,
 * and an edit makes a NEW stored mesh (the old one stays, which is what makes Undo cheap).
 */
export const MESH_MAGIC = "SRMH";
/** The version written for a mesh without creases, and the one with them. Both can be read. */
export const MESH_FORMAT_VERSION = 1;
export const MESH_FORMAT_VERSION_CREASES = 2;

/** Most points and triangles a mesh may have. A bigger one is refused rather than freezing the editor. */
export const MAX_MESH_POINTS = 1_000_000;
export const MAX_MESH_TRIANGLES = 1_000_000;

const HEADER_BYTES = 16;
const HEADER_BYTES_V2 = 20;

/**
 * Letters to bytes, without a text library: the magic is plain ASCII. (This package is built without
 * the browser's or Node's type library, so it avoids their text tools.)
 */
const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

/** The stored bytes of a mesh. The mesh must be valid (see `checkMesh`); a bad one throws. */
export function encodeMeshData(mesh: ShapeMesh): Uint8Array {
  const problem = checkMesh(mesh);
  if (problem) throw new Error(`Cannot store this mesh: ${problem}`);
  const points = mesh.positions.length / 3;
  const creases = mesh.creases ?? [];
  const withCreases = creases.length > 0;
  const header = withCreases ? HEADER_BYTES_V2 : HEADER_BYTES;
  const bytes = new Uint8Array(
    header +
      mesh.positions.length * 4 +
      mesh.indices.length * 4 +
      creases.length * 9,
  );
  bytes.set(ascii(MESH_MAGIC), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(
    4,
    withCreases ? MESH_FORMAT_VERSION_CREASES : MESH_FORMAT_VERSION,
    true,
  );
  view.setUint32(8, points, true);
  view.setUint32(12, mesh.indices.length, true);
  if (withCreases) view.setUint32(16, creases.length, true);
  let offset = header;
  for (let i = 0; i < mesh.positions.length; i++, offset += 4) {
    view.setFloat32(offset, mesh.positions[i]!, true);
  }
  for (let i = 0; i < mesh.indices.length; i++, offset += 4) {
    view.setUint32(offset, mesh.indices[i]!, true);
  }
  for (const crease of creases) {
    view.setUint32(offset, crease.a, true);
    offset += 4;
  }
  for (const crease of creases) {
    view.setUint32(offset, crease.b, true);
    offset += 4;
  }
  for (const crease of creases) {
    view.setUint8(offset, Math.round(crease.value * 255));
    offset += 1;
  }
  return bytes;
}

/** What is wrong with a mesh, in plain words, or null if it is fine to store and show. */
export function checkMesh(mesh: ShapeMesh): string | null {
  if (mesh.positions.length % 3 !== 0) {
    return "the list of points is not made of x, y, z triples.";
  }
  const points = mesh.positions.length / 3;
  if (points === 0) return "it has no points.";
  if (points > MAX_MESH_POINTS) {
    return `it has ${points.toLocaleString("en-US")} points; the limit is ${MAX_MESH_POINTS.toLocaleString("en-US")}.`;
  }
  if (mesh.indices.length % 3 !== 0) {
    return "the list of triangle corners is not made of threes.";
  }
  if (mesh.indices.length === 0) return "it has no triangles.";
  if (mesh.indices.length / 3 > MAX_MESH_TRIANGLES) {
    return `it has ${(mesh.indices.length / 3).toLocaleString("en-US")} triangles; the limit is ${MAX_MESH_TRIANGLES.toLocaleString("en-US")}.`;
  }
  for (let i = 0; i < mesh.positions.length; i++) {
    if (!Number.isFinite(mesh.positions[i]!)) {
      return "a point has a number that is not finite.";
    }
  }
  for (let i = 0; i < mesh.indices.length; i++) {
    if (mesh.indices[i]! >= points) {
      return "a triangle uses a point that does not exist.";
    }
  }
  return mesh.creases ? checkCreases(mesh.creases, points) : null;
}

export type DecodedMesh =
  { ok: true; mesh: ShapeMesh } | { ok: false; reason: string };

/**
 * Reads stored mesh bytes. The bytes may come from a file somebody else made, so everything is checked:
 * the letters, the version, that the sizes fit exactly, that numbers are finite and that no triangle uses
 * a point that is not there.
 */
export function decodeMeshData(bytes: Uint8Array): DecodedMesh {
  if (bytes.length < HEADER_BYTES) {
    return { ok: false, reason: "This is not mesh data (it is too small)." };
  }
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== MESH_MAGIC) {
    return { ok: false, reason: "This is not mesh data." };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (
    version !== MESH_FORMAT_VERSION &&
    version !== MESH_FORMAT_VERSION_CREASES
  ) {
    return {
      ok: false,
      reason: `The mesh uses version ${version} of the format; only versions ${MESH_FORMAT_VERSION} and ${MESH_FORMAT_VERSION_CREASES} are supported.`,
    };
  }
  const withCreases = version === MESH_FORMAT_VERSION_CREASES;
  const header = withCreases ? HEADER_BYTES_V2 : HEADER_BYTES;
  if (bytes.length < header) {
    return { ok: false, reason: "This is not mesh data (it is too small)." };
  }
  const points = view.getUint32(8, true);
  const corners = view.getUint32(12, true);
  const creaseCount = withCreases ? view.getUint32(16, true) : 0;
  // Sizes are checked before anything is allocated, so a lying header cannot ask for gigabytes
  if (
    points > MAX_MESH_POINTS ||
    corners > MAX_MESH_TRIANGLES * 3 ||
    creaseCount > MAX_CREASES
  ) {
    return { ok: false, reason: "The mesh is bigger than the allowed size." };
  }
  if (bytes.length !== header + points * 12 + corners * 4 + creaseCount * 9) {
    return {
      ok: false,
      reason: "The mesh data is damaged (its size does not match).",
    };
  }
  const positions = new Float32Array(points * 3);
  let offset = header;
  for (let i = 0; i < positions.length; i++, offset += 4) {
    positions[i] = view.getFloat32(offset, true);
  }
  const indices = new Uint32Array(corners);
  for (let i = 0; i < corners; i++, offset += 4) {
    indices[i] = view.getUint32(offset, true);
  }
  let creases: Crease[] | undefined;
  if (creaseCount > 0) {
    creases = [];
    const firsts = offset;
    const seconds = offset + creaseCount * 4;
    const values = offset + creaseCount * 8;
    for (let i = 0; i < creaseCount; i++) {
      creases.push({
        a: view.getUint32(firsts + i * 4, true),
        b: view.getUint32(seconds + i * 4, true),
        value: view.getUint8(values + i) / 255,
      });
    }
  }
  const mesh: ShapeMesh = creases
    ? { positions, indices, creases }
    : { positions, indices };
  const problem = checkMesh(mesh);
  return problem
    ? { ok: false, reason: `The mesh data is damaged: ${problem}` }
    : { ok: true, mesh };
}

/** The number of triangles and the box around a mesh, for the asset record in the scene. */
export function meshStats(mesh: ShapeMesh): {
  triangles: number;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const value = mesh.positions[i + k]!;
      if (value < min[k]!) min[k] = value;
      if (value > max[k]!) max[k] = value;
    }
  }
  return { triangles: mesh.indices.length / 3, boundsMin: min, boundsMax: max };
}
