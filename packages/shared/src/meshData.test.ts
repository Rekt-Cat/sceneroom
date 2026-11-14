import { describe, expect, it } from "vitest";
import {
  MAX_MESH_POINTS,
  MESH_FORMAT_VERSION,
  checkMesh,
  decodeMeshData,
  encodeMeshData,
  meshStats,
} from "./meshData";

/** A square made of two triangles. */
const square = () => ({
  positions: new Float32Array([0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});

describe("mesh data: storing and reading", () => {
  it("gives back exactly the points and triangles that were stored", () => {
    const mesh = square();
    const result = decodeMeshData(encodeMeshData(mesh));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.from(result.mesh.positions)).toEqual(
      Array.from(mesh.positions),
    );
    expect(Array.from(result.mesh.indices)).toEqual(Array.from(mesh.indices));
  });

  it("keeps float values exactly, including tiny and negative ones", () => {
    const mesh = {
      positions: new Float32Array([-1.5, 1e-7, 123456.78, 0, 0, 1, 1, 0, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const result = decodeMeshData(encodeMeshData(mesh));
    expect(result.ok && Array.from(result.mesh.positions)).toEqual(
      Array.from(mesh.positions),
    );
  });

  it("the same mesh gives the same bytes (so the same fingerprint)", () => {
    expect(Array.from(encodeMeshData(square()))).toEqual(
      Array.from(encodeMeshData(square())),
    );
  });

  it("works on bytes that sit in the middle of a bigger buffer", () => {
    const bytes = encodeMeshData(square());
    const padded = new Uint8Array(bytes.length + 7);
    padded.set(bytes, 3);
    const result = decodeMeshData(padded.subarray(3, 3 + bytes.length));
    expect(result.ok).toBe(true);
  });

  it("measures the triangles and the box", () => {
    expect(meshStats(square())).toEqual({
      triangles: 2,
      boundsMin: [0, 0, 0],
      boundsMax: [2, 3, 0],
    });
  });
});

describe("mesh data: refusing bad meshes and bad bytes", () => {
  const bad = (mesh: { positions: Float32Array; indices: Uint32Array }) =>
    checkMesh(mesh);

  it("a mesh that is not valid is refused when storing, saying why", () => {
    expect(
      bad({ positions: new Float32Array(4), indices: new Uint32Array(3) }),
    ).toContain("triples");
    expect(
      bad({ positions: new Float32Array(0), indices: new Uint32Array(0) }),
    ).toContain("no points");
    expect(
      bad({ positions: new Float32Array(9), indices: new Uint32Array(2) }),
    ).toContain("threes");
    expect(
      bad({ positions: new Float32Array(9), indices: new Uint32Array(0) }),
    ).toContain("no triangles");
    expect(
      bad({
        positions: new Float32Array(9),
        indices: new Uint32Array([0, 1, 3]),
      }),
    ).toContain("does not exist");
    const infinite = new Float32Array(9);
    infinite[4] = Infinity;
    expect(
      bad({ positions: infinite, indices: new Uint32Array([0, 1, 2]) }),
    ).toContain("not finite");
    expect(() =>
      encodeMeshData({
        positions: new Float32Array(9),
        indices: new Uint32Array([0, 1, 5]),
      }),
    ).toThrow("Cannot store");
  });

  it("too many points is refused", () => {
    const tooMany = {
      positions: new Float32Array(3 * (MAX_MESH_POINTS + 1)),
      indices: new Uint32Array(3),
    };
    expect(checkMesh(tooMany)).toContain("limit");
  });

  it("bytes that are not mesh data", () => {
    const reason = (bytes: Uint8Array) => {
      const result = decodeMeshData(bytes);
      return result.ok ? "" : result.reason;
    };
    expect(reason(new Uint8Array(4))).toContain("too small");
    expect(reason(new Uint8Array(40))).toContain("not mesh data");
  });

  it("a newer version, a size that does not match, and a header that lies about its size", () => {
    const reason = (bytes: Uint8Array) => {
      const result = decodeMeshData(bytes);
      return result.ok ? "" : result.reason;
    };
    const newer = encodeMeshData(square());
    new DataView(newer.buffer).setUint32(4, MESH_FORMAT_VERSION + 1, true);
    expect(reason(newer)).toContain("version");

    const cut = encodeMeshData(square()).slice(0, 40);
    expect(reason(cut)).toContain("size does not match");

    const lying = encodeMeshData(square());
    new DataView(lying.buffer).setUint32(8, 0xffffffff, true);
    expect(reason(lying)).toContain("bigger than the allowed size");
  });

  it("a stored triangle that uses a point that is not there, or a number that is not finite", () => {
    const reason = (bytes: Uint8Array) => {
      const result = decodeMeshData(bytes);
      return result.ok ? "" : result.reason;
    };
    const outOfRange = encodeMeshData(square());
    // the last stored corner: point number 3 -> 9
    new DataView(outOfRange.buffer).setUint32(outOfRange.length - 4, 9, true);
    expect(reason(outOfRange)).toContain("does not exist");

    const notFinite = encodeMeshData(square());
    new DataView(notFinite.buffer).setFloat32(16, NaN, true);
    expect(reason(notFinite)).toContain("not finite");
  });
});
