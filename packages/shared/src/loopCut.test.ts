import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOOP_CUT_OPTIONS,
  MAX_LOOP_CUTS,
  buildTopology,
  cutPositions,
  edgeBetween,
  edgeCount,
  edgeLoop,
  loopCut,
  loopCutPreview,
  sanitizeLoopCutOptions,
  type EditMesh,
  type Topology,
} from "./index";
import { box, plane } from "./testMeshes";

function cut(mesh: EditMesh, edge: number, options = {}) {
  const topology = buildTopology(mesh);
  const result = loopCut(mesh, topology, edge, options);
  if (!result.ok) throw new Error(result.reason);
  return { before: topology, result, after: buildTopology(result.mesh) };
}

const points = (m: EditMesh) => m.positions.length / 3;
const triangles = (m: EditMesh) => m.indices.length / 3;

describe("loop cut on a flat plane", () => {
  const mesh = plane(3); // 4 by 4 points, 3 by 3 squares; x and z go from 0 to 1
  const topology = buildTopology(mesh);
  // a horizontal edge in the second row (points 5 and 6): its ring runs down the column, 3 squares
  const edge = edgeBetween(topology, 5, 6);

  it("splits every square of the strip in two: 3 more squares, 4 new points", () => {
    const { result, after } = cut(mesh, edge);
    expect(points(result.mesh)).toBe(16 + 4);
    expect(triangles(result.mesh)).toBe(18 + 6);
    expect(after.faces).toHaveLength(9 + 3);
    expect(after.faces.every((f) => f.vertices.length === 4)).toBe(true);
    expect(result.selected).toHaveLength(4);
  });

  it("the new points are halfway along the crossed edges", () => {
    const { result } = cut(mesh, edge);
    for (const p of result.selected) {
      const x = result.mesh.positions[p * 3]!;
      // the crossed edge goes from x = 1/3 to x = 2/3
      expect(x).toBeCloseTo(0.5, 6);
    }
  });

  it("the new points form one new loop that crosses the whole plane", () => {
    const { after } = cut(mesh, edge);
    // find an edge of the new loop: both ends at x = 0.5
    let found = -1;
    for (let e = 0; e < edgeCount(after); e++) {
      const [a, b] = [after.edges[e * 2]!, after.edges[e * 2 + 1]!];
      if (
        Math.abs(after.vertexPositions[a * 3]! - 0.5) < 1e-6 &&
        Math.abs(after.vertexPositions[b * 3]! - 0.5) < 1e-6
      ) {
        found = e;
        break;
      }
    }
    expect(found).toBeGreaterThanOrEqual(0);
    const loop = edgeLoop(after, found);
    expect(loop.closed).toBe(false);
    expect(loop.edges).toHaveLength(3);
  });

  it("several cuts make several loops, evenly spaced", () => {
    const { result, after } = cut(mesh, edge, { cuts: 3 });
    expect(result.selected).toHaveLength(4 * 3);
    expect(after.faces).toHaveLength(9 + 3 * 3);
    const xs = new Set(
      result.selected.map(
        (p) => Math.round(result.mesh.positions[p * 3]! * 1e4) / 1e4,
      ),
    );
    // between x = 1/3 and 2/3: a quarter, a half and three quarters of the way
    expect([...xs].sort()).toEqual([0.4167, 0.5, 0.5833]);
  });

  it("slide moves the loops towards one end, never onto the edge", () => {
    const left = cut(mesh, edge, { slide: -1 }).result;
    const right = cut(mesh, edge, { slide: 1 }).result;
    const x = (r: typeof left) => r.mesh.positions[r.selected[0]! * 3]!;
    expect(x(left)).toBeLessThan(0.5);
    expect(x(right)).toBeGreaterThan(0.5);
    expect(x(left)).toBeGreaterThan(1 / 3);
    expect(x(right)).toBeLessThan(2 / 3);
  });
});

describe("loop cut on a box", () => {
  const mesh = box(2);
  const topology = buildTopology(mesh);

  /** An edge on the front side, between the middle and the right-hand edge, halfway up (a horizontal rung). */
  function frontEdge(t: Topology): number {
    const find = (x: number, y: number) => {
      for (let v = 0; v < t.vertexPositions.length / 3; v++) {
        if (
          Math.abs(t.vertexPositions[v * 3]! - x) < 1e-6 &&
          Math.abs(t.vertexPositions[v * 3 + 1]! - y) < 1e-6 &&
          Math.abs(t.vertexPositions[v * 3 + 2]! - 0.5) < 1e-6
        ) {
          return v;
        }
      }
      return -1;
    };
    return edgeBetween(t, find(0, 0), find(0.5, 0));
  }

  it("cuts the strip of 8 squares that goes all the way round the box, and every face stays a square", () => {
    const edge = frontEdge(topology);
    expect(edge).toBeGreaterThanOrEqual(0);
    const { result, after, before } = cut(mesh, edge);
    // the ring goes over the top, down the back, under the bottom and up the front: 8 squares, each split in two
    expect(after.faces).toHaveLength(before.faces.length + 8);
    expect(after.faces.every((f) => f.vertices.length === 4)).toBe(true);
    expect(triangles(result.mesh)).toBe(triangles(mesh) + 16);
  });

  it("keeps the box closed and facing outwards: every triangle's normal points away from the middle", () => {
    const edge = frontEdge(topology);
    const { result } = cut(mesh, edge, { cuts: 2 });
    const m = result.mesh;
    for (let t = 0; t < triangles(m); t++) {
      const [a, b, c] = [
        m.indices[t * 3]!,
        m.indices[t * 3 + 1]!,
        m.indices[t * 3 + 2]!,
      ];
      const p = (i: number) => [
        m.positions[i * 3]!,
        m.positions[i * 3 + 1]!,
        m.positions[i * 3 + 2]!,
      ];
      const [pa, pb, pc] = [p(a), p(b), p(c)];
      const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
      const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
      const n = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ];
      const centre = [
        (pa[0]! + pb[0]! + pc[0]!) / 3,
        (pa[1]! + pb[1]! + pc[1]!) / 3,
        (pa[2]! + pb[2]! + pc[2]!) / 3,
      ];
      expect(
        n[0]! * centre[0]! + n[1]! * centre[1]! + n[2]! * centre[2]!,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps the box's sharp edges sharp: points on the box's edges are not shared between its sides", () => {
    const edge = frontEdge(topology);
    const { result, after } = cut(mesh, edge);
    // each new point on the box's own edge sits on a spot shared by two sides: they are welded into one vertex
    expect(after.vertexPoints.some((points) => points.length === 2)).toBe(true);
    expect(points(result.mesh)).toBeGreaterThan(points(mesh));
  });
});

describe("when a cut cannot be made", () => {
  it("says so for a single triangle", () => {
    const mesh: EditMesh = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint32Array.from([0, 1, 2]),
    };
    const topology = buildTopology(mesh);
    const result = loopCut(mesh, topology, 0);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("no strip of squares");
  });

  it("refuses a strip that ends at a triangle (it would leave a gap)", () => {
    // two squares side by side, with a triangle fixed to the end of the strip's last rung
    const mesh: EditMesh = {
      positions: Float32Array.from([
        0,
        0,
        0,
        1,
        0,
        0,
        2,
        0,
        0, // 0 1 2
        0,
        1,
        0,
        1,
        1,
        0,
        2,
        1,
        0, // 3 4 5
        3,
        0.5,
        0, // 6: the triangle's tip
      ]),
      indices: Uint32Array.from([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 6, 5]),
    };
    const topology = buildTopology(mesh);
    // the edge from point 0 to point 3 is the left end; its ring goes across both squares to the edge 2-5,
    // which has the triangle on its other side
    const edge = edgeBetween(topology, 0, 3);
    expect(edge).toBeGreaterThanOrEqual(0);
    const result = loopCut(mesh, topology, edge);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("triangle");
  });

  it("an edge that does not exist is refused", () => {
    const mesh = plane(2);
    const result = loopCut(mesh, buildTopology(mesh), 999);
    expect(result.ok).toBe(false);
  });
});

describe("the options", () => {
  it("are made safe", () => {
    expect(sanitizeLoopCutOptions({})).toEqual(DEFAULT_LOOP_CUT_OPTIONS);
    expect(sanitizeLoopCutOptions({ cuts: 2.6, slide: 5 })).toEqual({
      cuts: 3,
      slide: 1,
    });
    expect(sanitizeLoopCutOptions({ cuts: 99, slide: -9 })).toEqual({
      cuts: MAX_LOOP_CUTS,
      slide: -1,
    });
    expect(sanitizeLoopCutOptions({ cuts: 0 }).cuts).toBe(1);
    expect(sanitizeLoopCutOptions({ cuts: NaN, slide: NaN })).toEqual(
      DEFAULT_LOOP_CUT_OPTIONS,
    );
  });

  it("put the cuts evenly between the ends, and slide moves all of them together", () => {
    expect(cutPositions({ cuts: 1, slide: 0 })).toEqual([0.5]);
    const three = cutPositions({ cuts: 3, slide: 0 });
    expect(three).toEqual([0.25, 0.5, 0.75]);
    const slid = cutPositions({ cuts: 3, slide: 1 });
    expect(slid[1]! - slid[0]!).toBeCloseTo(0.25, 9);
    for (const t of cutPositions({ cuts: 10, slide: 1 })) {
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
    }
    for (const t of cutPositions({ cuts: 10, slide: -1 })) {
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
    }
  });
});

describe("the preview", () => {
  it("is a line across each square of the strip for each cut", () => {
    const mesh = plane(3);
    const topology = buildTopology(mesh);
    const edge = edgeBetween(topology, 5, 6);
    const lines = loopCutPreview(mesh, topology, edge, { cuts: 2 })!;
    // 3 squares x 2 cuts x 2 spots x 3 numbers
    expect(lines).toHaveLength(3 * 2 * 2 * 3);
  });

  it("is null when the cut cannot be made", () => {
    const mesh: EditMesh = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint32Array.from([0, 1, 2]),
    };
    expect(loopCutPreview(mesh, buildTopology(mesh), 0)).toBeNull();
  });
});
