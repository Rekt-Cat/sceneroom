import { describe, expect, it } from "vitest";
import {
  buildTopology,
  edgeBetween,
  edgeCount,
  edgeLoop,
  edgePoints,
  edgeRing,
  edgesInRect,
  edgesNear,
  edgeVertices,
  facePoints,
  loopOrRingSelection,
  whyLoopStops,
  nearestEdge,
  pickedEdges,
  selectionAfterEdgeClick,
  selectionAfterFaceClick,
  selectedEdges,
  type EditMesh,
  type Topology,
} from "./index";
import { distanceToSegment } from "./topology";

import { box, grid, join, plane, tube } from "./testMeshes";

const unique = (list: number[]) => new Set(list).size === list.length;

describe("topology of a box", () => {
  const mesh = box(1);
  const topology = buildTopology(mesh);

  it("welds the three points at each corner into one vertex", () => {
    expect(mesh.positions.length / 3).toBe(24);
    expect(topology.vertexPoints).toHaveLength(8);
    expect(topology.vertexPoints.every((points) => points.length === 3)).toBe(
      true,
    );
  });

  it("makes each side one quad, and the diagonals are not edges", () => {
    expect(topology.faces).toHaveLength(6);
    expect(topology.faces.every((f) => f.vertices.length === 4)).toBe(true);
    expect(edgeCount(topology)).toBe(12);
  });

  it("every edge has two faces, every vertex three edges", () => {
    expect(topology.edgeFaces.every((faces) => faces.length === 2)).toBe(true);
    expect(topology.vertexEdges.every((edges) => edges.length === 3)).toBe(
      true,
    );
  });

  it("a loop stops at a corner (three edges meet, not four)", () => {
    const loop = edgeLoop(topology, 0);
    expect(loop.closed).toBe(false);
    expect(loop.edges).toEqual([0]);
  });

  it("every triangle knows its face", () => {
    expect(topology.triangleFace).toHaveLength(12);
    expect(
      Array.from(topology.triangleFace).every((f) => f >= 0 && f < 6),
    ).toBe(true);
    // the two triangles of a side are one face
    expect(topology.triangleFace[0]).toBe(topology.triangleFace[1]);
    expect(topology.triangleFace[0]).not.toBe(topology.triangleFace[2]);
  });
});

describe("edge loops and rings on a box with more cuts", () => {
  const topology = buildTopology(box(4));

  it("has the expected number of faces and edges", () => {
    expect(topology.faces).toHaveLength(6 * 16);
    // 3 axes x 5 x 4 x 4... each side has 2*4*5 = 40 edges, edges on box edges are shared by two sides
    expect(edgeCount(topology)).toBe(6 * 40 - 12 * 4);
  });

  /** A horizontal edge on the front side, one band up from the bottom. */
  function frontBelt(row: number): number {
    // find the edge between the two vertices at x=-0.5 and x=-0.25 on y = -0.5 + row/4, z = 0.5
    const find = (x: number, y: number) =>
      topology.vertexPositions.findIndex(
        (_, i) =>
          i % 3 === 0 &&
          Math.abs(topology.vertexPositions[i]! - x) < 1e-6 &&
          Math.abs(topology.vertexPositions[i + 1]! - y) < 1e-6 &&
          Math.abs(topology.vertexPositions[i + 2]! - 0.5) < 1e-6,
      ) / 3;
    const y = -0.5 + row / 4;
    return edgeBetween(topology, find(-0.5, y), find(-0.25, y));
  }

  it("the loop round the middle of the box is closed and has 16 edges (4 sides x 4)", () => {
    const loop = edgeLoop(topology, frontBelt(2));
    expect(loop.closed).toBe(true);
    expect(loop.edges).toHaveLength(16);
    expect(unique(loop.edges)).toBe(true);
    // every vertex of the loop has y = 0
    for (const edge of loop.edges) {
      for (const v of edgeVertices(topology, edge)) {
        expect(topology.vertexPositions[v * 3 + 1]).toBeCloseTo(0, 6);
      }
    }
  });

  it("the loop on the bottom ring of the front side goes round the box too", () => {
    // a row of edges at y = -0.25 (one band up from the bottom) is a belt round all four sides
    const loop = edgeLoop(topology, frontBelt(1));
    expect(loop.closed).toBe(true);
    expect(loop.edges).toHaveLength(16);
  });

  it("an edge on the very bottom runs along the bottom face's border: the loop is its square (16)", () => {
    // the bottom row of the front side is a box edge: three or more edges meet there, so it stops
    const loop = edgeLoop(topology, frontBelt(0));
    expect(loop.closed).toBe(false);
  });

  it("an edge ring goes across the strip of quads: 4 rungs on each of 4 sides, closed", () => {
    const ring = edgeRing(topology, frontBelt(2));
    // the belt's edge at the front, between x=-0.5 and x=-0.25, is a rung of the ring of edges that
    // all share that x position: it runs up the front, over the top, down the back and under the bottom
    expect(ring.closed).toBe(true);
    expect(unique(ring.edges)).toBe(true);
    expect(ring.edges).toHaveLength(16);
  });

  it("selecting a loop's points selects exactly the loop's edges", () => {
    const loop = edgeLoop(topology, frontBelt(2));
    const points = edgePoints(topology, loop.edges);
    // 16 vertices x 3 points at corners, 2 points elsewhere... just check it round-trips
    const back = selectedEdges(topology, points);
    expect(new Set(back)).toEqual(new Set(loop.edges));
  });
});

describe("a flat plane", () => {
  const topology = buildTopology(plane(3));

  it("is made of quads, one per square", () => {
    expect(topology.faces).toHaveLength(9);
    expect(topology.faces.every((f) => f.vertices.length === 4)).toBe(true);
    expect(edgeCount(topology)).toBe(24);
  });

  it("an inner line is a loop that ends at the border, not closed", () => {
    // the edge between vertex 5 and 6 (second row, second to third column) runs across the plane
    const edge = edgeBetween(topology, 5, 6);
    const loop = edgeLoop(topology, edge);
    expect(edge).toBeGreaterThanOrEqual(0);
    expect(loop.closed).toBe(false);
    expect(loop.edges).toHaveLength(3);
  });

  it("a border edge's loop follows the border all the way round (closed, 12 edges)", () => {
    const loop = edgeLoop(topology, edgeBetween(topology, 0, 1));
    expect(loop.closed).toBe(true);
    expect(loop.edges).toHaveLength(12);
  });

  it("a ring across the plane is the 4 parallel edges in the same column, ending at the border", () => {
    const ring = edgeRing(topology, edgeBetween(topology, 5, 6));
    expect(ring.closed).toBe(false);
    expect(ring.edges).toHaveLength(4);
    // 5-6 is in the second row of a 4 by 4 grid of points; the ring has one edge in each of the 4 rows
    const rows = ring.edges.map((e) =>
      Math.floor(edgeVertices(topology, e)[0] / 4),
    );
    expect(rows.sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("a tube with a seam", () => {
  const topology = buildTopology(tube(8, 4));

  it("welds the seam, so the sides join up", () => {
    // (8 + 1) points per row, welded to 8 vertices per row; 5 rows
    expect(topology.vertexPoints).toHaveLength(8 * 5);
    expect(topology.faces).toHaveLength(8 * 4);
  });

  it("a ring round the tube is a closed loop of 8 edges", () => {
    const loop = edgeLoop(topology, edgeBetween(topology, 8 + 0, 8 + 1));
    expect(loop.closed).toBe(true);
    expect(loop.edges).toHaveLength(8);
  });

  it("the open ends are borders: loop along the end is closed", () => {
    const loop = edgeLoop(topology, edgeBetween(topology, 0, 1));
    expect(loop.closed).toBe(true);
    expect(loop.edges).toHaveLength(8);
  });

  it("the ring of a band edge runs down the tube through all 5 rows, ending at both open ends", () => {
    const ring = edgeRing(topology, edgeBetween(topology, 8, 9));
    expect(ring.closed).toBe(false);
    expect(ring.edges).toHaveLength(5);
  });

  it("the ring of an upright edge goes round the tube (closed, 8 edges)", () => {
    const ring = edgeRing(topology, edgeBetween(topology, 8, 16));
    expect(ring.closed).toBe(true);
    expect(ring.edges).toHaveLength(8);
  });
});

describe("a tube with fan caps", () => {
  const topology = buildTopology(tube(12, 3, true));
  const middle =
    topology.vertexPositions.findIndex(
      (_, i) =>
        i % 3 === 0 &&
        topology.vertexPositions[i]! === 0 &&
        topology.vertexPositions[i + 1]! === 0 &&
        topology.vertexPositions[i + 2]! === 0,
    ) / 3;

  it("joins neighbouring fan triangles into kites, so the middle has 6 spokes: a pole", () => {
    expect(topology.vertexEdges[middle]).toHaveLength(6);
  });

  it("a loop never passes through a pole", () => {
    for (const edge of topology.vertexEdges[middle]!) {
      const loop = edgeLoop(topology, edge);
      const atMiddle = loop.edges.filter((e) =>
        edgeVertices(topology, e).includes(middle),
      );
      expect(atMiddle).toHaveLength(1); // only the edge it started on
    }
  });
});

describe("a bent mesh keeps its quads, a crease does not", () => {
  it("two squares folded at 90 degrees stay two quads and the fold is an edge", () => {
    const folded = join([
      grid(1, 1, (u, v) => [u, 0, v]),
      grid(1, 1, (u, v) => [u, v, 0]),
    ]);
    const topology = buildTopology(folded);
    expect(topology.faces).toHaveLength(2);
    expect(topology.faces.every((f) => f.vertices.length === 4)).toBe(true);
  });

  it("a single triangle stays a triangle", () => {
    const topology = buildTopology({
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: Uint32Array.from([0, 1, 2]),
    });
    expect(topology.faces).toHaveLength(1);
    expect(topology.faces[0]!.vertices).toHaveLength(3);
    expect(edgeCount(topology)).toBe(3);
  });

  it("two triangles in a row that share an edge are one quad even if the quad has a dent (an arrow shape)", () => {
    // a (0,0), b (4,0), c (-1,1), d (-1,-1): both triangles face the same way, the quad is concave at a
    const topology = buildTopology({
      positions: Float32Array.from([0, 0, 0, 4, 0, 0, -1, 1, 0, -1, -1, 0]),
      indices: Uint32Array.from([0, 1, 2, 1, 0, 3]),
    });
    expect(topology.faces).toHaveLength(1);
    expect(topology.faces[0]!.vertices).toHaveLength(4);
  });

  it("two triangles that fold back over each other (opposite directions) stay two triangles", () => {
    const topology = buildTopology({
      positions: Float32Array.from([0, 0, 0, 2, 0, 0, 1, 0.5, 0, 1, 0.2, 0]),
      indices: Uint32Array.from([0, 1, 2, 1, 0, 3]),
    });
    expect(topology.faces).toHaveLength(2);
  });

  it("but triangles that are not in a row are only joined if their SHAPE says square: a dart is not", () => {
    // the same two triangles with another triangle between them: now only the shape rule can join them
    const topology = buildTopology({
      positions: Float32Array.from([
        0, 0, 0, 2, 0, 0, 1, 0.5, 0, 1, 0.2, 0, 10, 10, 10, 11, 10, 10, 10, 11,
        10,
      ]),
      indices: Uint32Array.from([0, 1, 2, 4, 5, 6, 1, 0, 3]),
    });
    expect(topology.faces).toHaveLength(3);
  });

  it("a square made of triangles in another order is still found by its shape", () => {
    const topology = buildTopology({
      positions: Float32Array.from([
        0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 9, 9, 9, 10, 9, 9, 9, 10, 9,
      ]),
      // the square's two triangles are not next to each other in the list
      indices: Uint32Array.from([0, 1, 3, 4, 5, 6, 1, 2, 3]),
    });
    expect(topology.faces.filter((f) => f.vertices.length === 4)).toHaveLength(
      1,
    );
  });

  it("a triangle with no area is ignored", () => {
    const topology = buildTopology({
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0]),
      indices: Uint32Array.from([0, 1, 2, 0, 1, 3]),
    });
    expect(topology.triangleFace[0]).toBe(-1);
    expect(topology.faces).toHaveLength(1);
  });

  it("an empty mesh has nothing", () => {
    const topology = buildTopology({
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
    });
    expect(topology.faces).toEqual([]);
    expect(edgeCount(topology)).toBe(0);
    expect(edgeLoop(topology, 0)).toEqual({ edges: [], closed: false });
    expect(edgeRing(topology, 0)).toEqual({ edges: [], closed: false });
  });
});

describe("picking edges", () => {
  const topology = buildTopology(plane(2));
  /** Screen spots for every point: x = 100 * x, y = 100 * z. */
  const projected = (() => {
    const out = new Float32Array(topology.vertexOf.length * 2);
    // (plane(2) has 9 points and 9 vertices, in the same order)
    for (let p = 0; p < 9; p++) {
      out[p * 2] = (p % 3) * 100;
      out[p * 2 + 1] = Math.floor(p / 3) * 100;
    }
    return out;
  })();

  it("finds the edge nearest to the pointer, within the distance", () => {
    const edge = nearestEdge(topology, projected, 50, 3, 10);
    expect(edge).toBe(edgeBetween(topology, 0, 1));
    expect(nearestEdge(topology, projected, 50, 40, 10)).toBe(-1);
  });

  it("ignores edges that cannot be shown (NaN)", () => {
    const hidden = Float32Array.from(projected);
    hidden[0] = NaN;
    hidden[1] = NaN;
    expect(nearestEdge(topology, hidden, 50, 3, 10)).not.toBe(
      edgeBetween(topology, 0, 1),
    );
  });

  it("finds the edges inside a box", () => {
    const inside = edgesInRect(topology, projected, {
      left: -5,
      top: -5,
      right: 105,
      bottom: 105,
    });
    // the 4 edges of the top-left square
    expect(inside).toHaveLength(4);
  });

  it("measures the distance to a segment, also past its ends", () => {
    expect(distanceToSegment(5, 5, 0, 0, 10, 0)).toBe(5);
    expect(distanceToSegment(-3, 4, 0, 0, 10, 0)).toBe(5);
    expect(distanceToSegment(1, 1, 3, 3, 3, 3)).toBeCloseTo(Math.hypot(2, 2));
  });

  it("gives the points of a face", () => {
    const points = facePoints(topology, 0);
    expect(points.sort()).toEqual([0, 1, 3, 4]);
  });
});

describe("a topology can be walked from any vertex", () => {
  const t: Topology = buildTopology(box(2));
  it("every edge is listed at both of its vertices", () => {
    for (let e = 0; e < edgeCount(t); e++) {
      for (const v of edgeVertices(t, e)) {
        expect(t.vertexEdges[v]).toContain(e);
      }
    }
  });
});

describe("what a click selects", () => {
  const t = buildTopology(plane(3));
  const belt = edgeBetween(t, 5, 6);

  it("an edge click selects the two points at its ends and replaces the selection", () => {
    const points = selectionAfterEdgeClick(t, [0, 1, 2], belt, false);
    expect(points.sort()).toEqual([5, 6]);
  });

  it("with Shift it adds, and a second Shift click takes it out again", () => {
    const added = selectionAfterEdgeClick(t, [0], belt, true);
    expect(added.sort()).toEqual([0, 5, 6]);
    const removed = selectionAfterEdgeClick(t, added, belt, true);
    expect(removed).toEqual([0]);
  });

  it("empty space clears, or (Shift) changes nothing", () => {
    expect(selectionAfterEdgeClick(t, [1, 2], -1, false)).toEqual([]);
    expect(selectionAfterEdgeClick(t, [1, 2], -1, true)).toEqual([1, 2]);
    expect(selectionAfterFaceClick(t, [1, 2], -1, false)).toEqual([]);
  });

  it("a loop click selects every point along the loop", () => {
    const points = selectionAfterEdgeClick(t, [], belt, false, "loop");
    expect(points.sort((a, b) => a - b)).toEqual([4, 5, 6, 7]);
    expect(pickedEdges(t, belt, "loop")).toHaveLength(3);
  });

  it("a ring click selects the parallel edges across the strip", () => {
    const points = selectionAfterEdgeClick(t, [], belt, false, "ring");
    // one edge in each of the 4 rows, in column 1 to 2: points 1,2 5,6 9,10 13,14
    expect(points.sort((a, b) => a - b)).toEqual([1, 2, 5, 6, 9, 10, 13, 14]);
  });

  it("a face click selects its four corners", () => {
    expect(selectionAfterFaceClick(t, [], 0, false).sort()).toEqual([
      0, 1, 4, 5,
    ]);
  });

  it("Loop and Ring replace the selection with the loop or ring of the clicked edge", () => {
    const clicked = selectionAfterEdgeClick(t, [], belt, false);
    const [pa, pb] = [clicked[0]!, clicked[1]!];
    const loop = loopOrRingSelection(t, clicked, [pa, pb], "loop");
    expect(loop.ok && loop.points.sort((a, b) => a - b)).toEqual([4, 5, 6, 7]);
    // then Ring from the same edge: just that edge's ring, not the ring of every edge of the loop
    const ring = loopOrRingSelection(
      t,
      loop.ok ? loop.points : [],
      [pa, pb],
      "ring",
    );
    expect(ring.ok && ring.points).toHaveLength(8);
    expect(ring.ok && ring.edge).toBe(belt);
  });

  it("works from the single selected edge when there is no anchor", () => {
    const clicked = selectionAfterEdgeClick(t, [], belt, false);
    const result = loopOrRingSelection(t, clicked, null, "loop");
    expect(result.ok && result.edges).toHaveLength(3);
  });

  it("ignores an anchor that is no longer selected", () => {
    const clicked = selectionAfterEdgeClick(t, [], belt, false);
    // the anchor is another edge's points, not selected: falls back to the one selected edge
    const result = loopOrRingSelection(t, clicked, [0, 1], "loop");
    expect(result.ok && result.edge).toBe(belt);
  });

  it("says what to do when no edge is selected, or several are and none is the clicked one", () => {
    expect(loopOrRingSelection(t, [], null, "loop")).toMatchObject({
      ok: false,
    });
    expect(loopOrRingSelection(t, [0, 5], null, "loop")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("Select an edge first"),
    });
    const severalEdges = selectionAfterEdgeClick(t, [], belt, false, "loop");
    const result = loopOrRingSelection(t, severalEdges, null, "ring");
    expect(!result.ok && result.reason).toContain("Several edges");
  });
});

describe("a mesh that has been pulled about keeps its squares", () => {
  /** A deterministic wobble: every point moved by up to `amount` in each direction. */
  function wobble(mesh: EditMesh, amount: number): EditMesh {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296 - 0.5;
    };
    const positions = Float32Array.from(mesh.positions);
    // Move every spot (all points on it together), as the editor does
    const groups = new Map<string, [number, number, number]>();
    for (let i = 0; i < positions.length; i += 3) {
      const key = `${positions[i]},${positions[i + 1]},${positions[i + 2]}`;
      let move = groups.get(key);
      if (!move) {
        move = [
          random() * 2 * amount,
          random() * 2 * amount,
          random() * 2 * amount,
        ];
        groups.set(key, move);
      }
      positions[i]! += move[0];
      positions[i + 1]! += move[1];
      positions[i + 2]! += move[2];
    }
    return { positions, indices: mesh.indices };
  }

  it("a cube cut into 4, with every point moved a lot, still has 96 quads", () => {
    const topology = buildTopology(wobble(box(4), 0.08));
    expect(topology.faces).toHaveLength(96);
    expect(topology.faces.every((f) => f.vertices.length === 4)).toBe(true);
  });

  it("and its loops and rings still go all the way round", () => {
    const topology = buildTopology(wobble(box(4), 0.08));
    // find any closed loop with 16 edges: the belts round the box
    const loops = Array.from({ length: edgeCount(topology) }, (_, e) =>
      edgeLoop(topology, e),
    );
    expect(loops.some((loop) => loop.closed && loop.edges.length === 16)).toBe(
      true,
    );
    const rings = Array.from({ length: edgeCount(topology) }, (_, e) =>
      edgeRing(topology, e),
    );
    expect(rings.some((ring) => ring.closed && ring.edges.length === 16)).toBe(
      true,
    );
  });

  it("the loop and the ring through the same edge are different edges", () => {
    const topology = buildTopology(wobble(box(4), 0.08));
    // an edge in the middle of the front side
    const middle = Array.from(
      { length: edgeCount(topology) },
      (_, e) => e,
    ).find((e) => {
      const [a, b] = edgeVertices(topology, e);
      return (
        topology.vertexEdges[a]!.length === 4 &&
        topology.vertexEdges[b]!.length === 4
      );
    })!;
    const loop = edgeLoop(topology, middle).edges;
    const ring = edgeRing(topology, middle).edges;
    expect(loop.length).toBeGreaterThan(1);
    expect(ring.length).toBeGreaterThan(1);
    expect(new Set(loop)).not.toEqual(new Set(ring));
  });
});

describe("why a loop stops", () => {
  it("says a cube corner has 3 edges", () => {
    const t = buildTopology(box(1));
    expect(whyLoopStops(t, 0)).toContain("3 edges meet");
    expect(whyLoopStops(t, 0)).toContain("cube's corner");
  });

  it("is null when the loop can grow, or the edge does not exist", () => {
    const t = buildTopology(box(4));
    const middle = Array.from({ length: edgeCount(t) }, (_, e) => e).find(
      (e) => edgeLoop(t, e).edges.length > 1,
    )!;
    expect(whyLoopStops(t, middle)).toBeNull();
    expect(whyLoopStops(t, -1)).toBeNull();
    expect(whyLoopStops(t, 9999)).toBeNull();
  });

  it("mentions triangles when one is next to the edge", () => {
    // three triangles round a middle point: two in a row become a quad, the third stays a triangle
    const t = buildTopology({
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, -1, -1, 0]),
      indices: Uint32Array.from([0, 1, 2, 0, 2, 3, 0, 3, 1]),
    });
    const inner = edgeBetween(t, 0, 1);
    expect(inner).toBeGreaterThanOrEqual(0);
    expect(whyLoopStops(t, inner)).toContain("triangle");
  });
});

describe("the edges near a spot, nearest first", () => {
  const t = buildTopology(plane(2));
  const projected = (() => {
    const out = new Float32Array(9 * 2);
    for (let p = 0; p < 9; p++) {
      out[p * 2] = (p % 3) * 100;
      out[p * 2 + 1] = Math.floor(p / 3) * 100;
    }
    return out;
  })();

  it("lists the edges in the order of their distance", () => {
    const near = edgesNear(t, projected, 50, 10, 120);
    expect(near[0]).toBe(edgeBetween(t, 0, 1));
    expect(near.length).toBeGreaterThan(2);
    expect(edgesNear(t, projected, 50, 40, 10)).toEqual([]);
  });
});
