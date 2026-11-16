import { describe, expect, it } from "vitest";
import {
  edgeBetween,
  edgeCount,
  edgeLoop,
  edgeRing,
  edgeVertices,
  type PrimitiveKind,
  type Topology,
} from "@sceneroom/shared";
import { buildShapeGeometry } from "@/components/viewport/shapeGeometry";
import { topologyOfGeometry } from "./geometryTopology";

/** The topology of one of the editor's own shapes, as three.js builds it. */
function topologyOf(kind: PrimitiveKind, segments: number): Topology {
  const geometry = buildShapeGeometry(kind, segments, []);
  const topology = topologyOfGeometry(geometry)!;
  geometry.dispose();
  return topology;
}

/** An edge from its two end spots (x, y, z each), or -1. */
function edgeAt(
  t: Topology,
  a: [number, number, number],
  b: [number, number, number],
): number {
  const find = (spot: [number, number, number]) => {
    for (let v = 0; v < t.vertexPoints.length; v++) {
      if (
        Math.abs(t.vertexPositions[v * 3]! - spot[0]) < 1e-5 &&
        Math.abs(t.vertexPositions[v * 3 + 1]! - spot[1]) < 1e-5 &&
        Math.abs(t.vertexPositions[v * 3 + 2]! - spot[2]) < 1e-5
      ) {
        return v;
      }
    }
    return -1;
  };
  return edgeBetween(t, find(a), find(b));
}

describe("the editor's own shapes", () => {
  it("a cube is six quads and twelve edges", () => {
    const t = topologyOf("cube", 1);
    expect(t.faces).toHaveLength(6);
    expect(t.faces.every((f) => f.vertices.length === 4)).toBe(true);
    expect(edgeCount(t)).toBe(12);
    expect(t.vertexPoints).toHaveLength(8);
  });

  it("a cube cut into 4 has a belt round the middle: a closed loop of 16 edges", () => {
    const t = topologyOf("cube", 4);
    expect(t.faces).toHaveLength(96);
    const loop = edgeLoop(t, edgeAt(t, [-0.5, 0, 0.5], [-0.25, 0, 0.5]));
    expect(loop.closed).toBe(true);
    expect(loop.edges).toHaveLength(16);
  });

  it("the ring across the same cube goes over the top, down the back and under: 16 edges, closed", () => {
    const t = topologyOf("cube", 4);
    const ring = edgeRing(t, edgeAt(t, [-0.5, 0, 0.5], [-0.25, 0, 0.5]));
    expect(ring.closed).toBe(true);
    expect(ring.edges).toHaveLength(16);
  });

  it("a plane is a grid of quads; a cut plane's inner loop reaches both borders", () => {
    const t = topologyOf("plane", 4);
    expect(t.faces).toHaveLength(16);
    expect(t.faces.every((f) => f.vertices.length === 4)).toBe(true);
    const loop = edgeLoop(t, edgeAt(t, [-0.5, 0, 0], [-0.25, 0, 0]));
    // the middle row of the plane: 4 edges across, from one border to the other
    expect(loop.closed).toBe(false);
    expect(loop.edges).toHaveLength(4);
  });

  it("a cylinder's side has closed loops round it, and its cap middle is a pole", () => {
    const t = topologyOf("cylinder", 4);
    // every closed loop on the side has as many edges as the cylinder has sides
    const closed = Array.from({ length: edgeCount(t) }, (_, e) =>
      edgeLoop(t, e),
    ).filter((loop) => loop.closed);
    expect(closed.length).toBeGreaterThan(0);
    // the cap middles: vertices where many edges meet
    const poles = t.vertexEdges.filter((edges) => edges.length > 4);
    expect(poles.length).toBe(2);
  });

  it("a sphere has poles at the top and bottom, and closed loops round its middle", () => {
    const t = topologyOf("sphere", 1);
    const poles = t.vertexEdges.filter((edges) => edges.length > 4);
    expect(poles.length).toBeGreaterThanOrEqual(2);
    // some loop round the sphere is closed, with no edge at a pole
    const loops = Array.from({ length: edgeCount(t) }, (_, e) =>
      edgeLoop(t, e),
    ).filter((loop) => loop.closed && loop.edges.length > 4);
    expect(loops.length).toBeGreaterThan(0);
    for (const loop of loops.slice(0, 20)) {
      for (const e of loop.edges) {
        for (const v of edgeVertices(t, e)) {
          expect(t.vertexEdges[v]!.length).toBeLessThanOrEqual(4);
        }
      }
    }
  });
});
