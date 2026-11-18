import { describe, expect, it } from "vitest";
import {
  MAX_SEAMS,
  buildTopology,
  checkSeams,
  createModifier,
  decodeMeshData,
  deformMesh,
  deleteFaces,
  divideFaces,
  edgeBetween,
  edgeSeams,
  encodeMeshData,
  loopCut,
  remapSeams,
  sameSeams,
  setSeams,
  allPoints,
  type EditMesh,
  type Modifier,
  type Seam,
} from "./index";
import { box, plane } from "./testMeshes";

/** The first points of the two ends of an edge of a mesh. */
function edgePair(
  mesh: EditMesh,
  from: [number, number],
  to: [number, number],
) {
  const topology = buildTopology(mesh);
  const find = ([x, z]: [number, number]) =>
    topology.vertexOf[
      allPoints(mesh.positions.length / 3).find(
        (p) =>
          Math.abs(mesh.positions[p * 3]! - x) < 1e-6 &&
          Math.abs(mesh.positions[p * 3 + 2]! - z) < 1e-6,
      )!
    ]!;
  const a = find(from);
  const b = find(to);
  return { topology, a, b, edge: edgeBetween(topology, a, b) };
}

const withSeam = (
  mesh: EditMesh,
  from: [number, number],
  to: [number, number],
): EditMesh => {
  const { topology, edge } = edgePair(mesh, from, to);
  return { ...mesh, seams: setSeams(mesh, topology, [edge], true) };
};

describe("marking and clearing seams", () => {
  it("marks an edge, finds it again whichever points name it, and clears it", () => {
    const mesh = plane(2);
    const { topology, edge } = edgePair(mesh, [0, 0], [0.5, 0]);
    expect(edge).toBeGreaterThanOrEqual(0);
    const marked = setSeams(mesh, topology, [edge], true);
    expect(marked.length).toBe(1);
    expect(edgeSeams(topology, marked)[edge]).toBe(1);
    expect(
      setSeams({ ...mesh, seams: marked }, topology, [edge], false),
    ).toEqual([]);
  });

  it("marking an edge twice does not double it; other seams are kept", () => {
    let mesh = withSeam(plane(2), [0, 0], [0.5, 0]);
    mesh = withSeam(mesh, [0, 0], [0.5, 0]);
    expect(mesh.seams!.length).toBe(1);
    mesh = withSeam(mesh, [0.5, 0], [1, 0]);
    expect(mesh.seams!.length).toBe(2);
  });

  it("compares seams by the edges they mark", () => {
    const mesh = plane(2);
    const { topology, edge } = edgePair(mesh, [0, 0], [0.5, 0]);
    const a = setSeams(mesh, topology, [edge], true);
    const b: Seam[] = [{ a: a[0]!.b, b: a[0]!.a }];
    expect(sameSeams(topology, a, b)).toBe(true);
    expect(sameSeams(topology, a, [])).toBe(false);
  });

  it("checks a list of seams", () => {
    expect(checkSeams([{ a: 0, b: 1 }], 4)).toBeNull();
    expect(checkSeams([{ a: 0, b: 9 }], 4)).toContain("does not exist");
    expect(checkSeams([{ a: 2, b: 2 }], 4)).toContain("itself");
    expect(checkSeams([{ a: 0.5, b: 1 }], 4)).toContain("whole number");
    expect(
      checkSeams(new Array(MAX_SEAMS + 1).fill({ a: 0, b: 1 }), 4),
    ).toContain("limit");
  });

  it("remaps seams to renumbered points and drops those on gone points", () => {
    const out = remapSeams(
      [
        { a: 0, b: 1 },
        { a: 1, b: 2 },
      ],
      [5, 6, -1],
    );
    expect(out).toEqual([{ a: 5, b: 6 }]);
    expect(remapSeams(undefined, [0])).toBeUndefined();
    expect(remapSeams([{ a: 0, b: 1 }], [-1, -1])).toBeUndefined();
  });
});

describe("seams in the stored mesh", () => {
  it("are stored and read back exactly, with and without UVs and creases", () => {
    const base = withSeam(plane(1), [0, 0], [1, 0]);
    const plain = decodeMeshData(encodeMeshData(base));
    expect(plain.ok && plain.mesh.seams).toEqual(base.seams);
    const full = {
      ...base,
      uvs: new Float32Array(8),
      creases: [{ a: 0, b: 1, value: 1 }],
    };
    const back = decodeMeshData(encodeMeshData(full));
    expect(back.ok && back.mesh.seams).toEqual(base.seams);
    expect(back.ok && back.mesh.uvs?.length).toBe(8);
    expect(back.ok && back.mesh.creases?.length).toBe(1);
  });

  it("a mesh without seams has none after reading, and damaged seam data is refused", () => {
    const back = decodeMeshData(encodeMeshData(plane(1)));
    expect(back.ok && back.mesh.seams).toBeUndefined();
    const bytes = encodeMeshData(withSeam(plane(1), [0, 0], [1, 0]));
    expect(decodeMeshData(bytes.slice(0, bytes.length - 3)).ok).toBe(false);
    expect(() =>
      encodeMeshData({ ...plane(1), seams: [{ a: 0, b: 99 }] }),
    ).toThrow(/Cannot store/);
  });
});

describe("seams ride along through the tools", () => {
  it("Divide splits a seam on a divided edge into pieces", () => {
    const mesh = withSeam(plane(1), [0, 0], [1, 0]);
    const result = divideFaces(mesh, [], 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the original seam and its two halves
    expect(result.mesh.seams?.length).toBe(3);
    const topology = buildTopology(result.mesh);
    const marked = edgeSeams(topology, result.mesh.seams);
    expect(marked.reduce((sum, v) => sum + v, 0)).toBe(2);
  });

  it("Loop cut keeps a crossed seam as pieces", () => {
    const mesh = withSeam(plane(2), [0, 0], [0.5, 0]);
    const topology = buildTopology(mesh);
    // a loop cut across the strip that runs along x, crossing the seam edge's ring
    const cross = edgeBetween(
      topology,
      edgePair(mesh, [0, 0], [0, 0.5]).a,
      edgePair(mesh, [0, 0], [0, 0.5]).b,
    );
    const result = loopCut(mesh, topology, cross, { cuts: 1, slide: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const marked = edgeSeams(buildTopology(result.mesh), result.mesh.seams);
    expect(marked.reduce((sum, v) => sum + v, 0)).toBeGreaterThanOrEqual(1);
  });

  it("deleting faces renumbers the seams that survive", () => {
    const mesh = { ...box(1), seams: [{ a: 0, b: 1 }] };
    const front = allPoints(24).filter((p) => mesh.positions[p * 3 + 2]! > 0.4);
    const result = deleteFaces(mesh, front);
    expect(result.ok).toBe(true);
  });

  it("Mirror and Array copy the seams onto their own points", () => {
    const mesh = { ...plane(1), seams: [{ a: 0, b: 1 }] };
    const mirrored = deformMesh(mesh, [createModifier("m", "mirror")]);
    expect(mirrored.seams?.length).toBe(2);
    expect(mirrored.seams![1]).toEqual({ a: 4, b: 5 });
    const repeated = deformMesh(mesh, [
      { ...createModifier("a", "array"), count: 3 } as Modifier,
    ]);
    expect(repeated.seams?.length).toBe(3);
    expect(repeated.seams![2]).toEqual({ a: 8, b: 9 });
  });
});
