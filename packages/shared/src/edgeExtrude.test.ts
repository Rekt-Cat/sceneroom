import { describe, expect, it } from "vitest";
import { buildTopology, extrudeEdges } from "./index";
import { box, plane } from "./testMeshes";

const triangles = (m: { indices: Uint32Array }) => m.indices.length / 3;

describe("extrude edges", () => {
  it("a border edge of a plane grows the plane outwards, flat and facing up", () => {
    const mesh = plane(1); // x and z from 0 to 1
    const t = buildTopology(mesh);
    const border = t.edgeFaces
      .map((f, e) => ({ f, e }))
      .filter(({ f, e }) => {
        const [a] = [t.edges[e * 2]!, t.edges[e * 2 + 1]!];
        void a;
        return f.length === 1;
      })
      .map(({ e }) => e);
    // the edge on the side x = 0
    const side = border.find((e) => {
      const a = t.edges[e * 2]!;
      const b = t.edges[e * 2 + 1]!;
      return t.vertexPositions[a * 3]! === 0 && t.vertexPositions[b * 3]! === 0;
    })!;
    const r = extrudeEdges(mesh, t, [side], 0.5);
    if (!r.ok) throw new Error(r.reason);
    expect(triangles(r.mesh)).toBe(triangles(mesh) + 2);
    // the new points are at x = -0.5, still flat
    for (const p of r.selected) {
      expect(r.mesh.positions[p * 3]).toBeCloseTo(-0.5);
      expect(r.mesh.positions[p * 3 + 1]).toBeCloseTo(0);
    }
    const flatSign = (
      m: { positions: Float32Array },
      i0: number,
      i1: number,
      i2: number,
    ) => {
      const p = m.positions;
      const ux = p[i1 * 3]! - p[i0 * 3]!;
      const uz = p[i1 * 3 + 2]! - p[i0 * 3 + 2]!;
      const vx = p[i2 * 3]! - p[i0 * 3]!;
      const vz = p[i2 * 3 + 2]! - p[i0 * 3 + 2]!;
      return Math.sign(uz * vx - ux * vz);
    };
    const planeSign = flatSign(
      mesh,
      mesh.indices[0]!,
      mesh.indices[1]!,
      mesh.indices[2]!,
    );
    // the wall faces up like the plane: its triangles have a positive y normal
    const n = triangles(mesh) * 3;
    for (let i = n; i < r.mesh.indices.length; i += 3) {
      expect(
        flatSign(
          r.mesh,
          r.mesh.indices[i]!,
          r.mesh.indices[i + 1]!,
          r.mesh.indices[i + 2]!,
        ),
      ).toBe(planeSign);
    }
    // joined to the plane: no border edge appears except the new edge and the old sides
    expect(buildTopology(r.mesh).edgeFaces.every((f) => f.length <= 2)).toBe(
      true,
    );
  });

  it("divisions cut the wall into bands", () => {
    const mesh = plane(1);
    const t = buildTopology(mesh);
    const e = t.edgeFaces.findIndex((f) => f.length === 1);
    const r = extrudeEdges(mesh, t, [e], 0.5, 3);
    if (!r.ok) throw new Error(r.reason);
    expect(triangles(r.mesh)).toBe(triangles(mesh) + 6);
  });

  it("an edge of a cube makes a fin along the average direction of its two faces", () => {
    const mesh = box(1);
    const t = buildTopology(mesh);
    const e = 0;
    const r = extrudeEdges(mesh, t, [e], 0.3);
    if (!r.ok) throw new Error(r.reason);
    expect(triangles(r.mesh)).toBe(triangles(mesh) + 2);
    expect(r.selected.length).toBe(2);
  });

  it("a chain shares its corners (one new point per corner)", () => {
    const mesh = plane(2);
    const t = buildTopology(mesh);
    const edges = t.edgeFaces
      .map((f, e) => ({ f, e }))
      .filter(({ f, e }) => {
        const a = t.edges[e * 2]!;
        const b = t.edges[e * 2 + 1]!;
        return (
          f.length === 1 &&
          t.vertexPositions[a * 3 + 2]! === 0 &&
          t.vertexPositions[b * 3 + 2]! === 0
        );
      })
      .map(({ e }) => e);
    expect(edges.length).toBe(2);
    const r = extrudeEdges(mesh, t, edges, 0.4);
    if (!r.ok) throw new Error(r.reason);
    expect(r.selected.length).toBe(3);
  });

  it("refuses with no edge or no distance", () => {
    const mesh = plane(1);
    const t = buildTopology(mesh);
    expect(extrudeEdges(mesh, t, [], 1).ok).toBe(false);
    expect(extrudeEdges(mesh, t, [0], 0).ok).toBe(false);
  });
});
