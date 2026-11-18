import { describe, expect, it } from "vitest";
import {
  allPoints,
  buildTopology,
  edgeBetween,
  growSelection,
  invertSelection,
  outlineSelection,
  selectSimilar,
  shrinkSelection,
  type EditMesh,
  type SelectionResult,
} from "./index";
import { box, plane, tube } from "./testMeshes";

function points(result: SelectionResult): number[] {
  if (!result.ok) throw new Error(result.reason);
  return result.points;
}

/** The points of a mesh at an x and z (any height). */
const at = (mesh: EditMesh, x: number, z: number) =>
  allPoints(mesh.positions.length / 3).filter(
    (p) =>
      Math.abs(mesh.positions[p * 3]! - x) < 1e-6 &&
      Math.abs(mesh.positions[p * 3 + 2]! - z) < 1e-6,
  );

const spots = (mesh: EditMesh, selection: number[]) =>
  new Set(selection.map((p) => buildTopology(mesh).vertexOf[p])).size;

describe("select more and less", () => {
  const mesh = plane(4); // 5 by 5 points, 0 to 1
  const topology = buildTopology(mesh);

  it("grows by one step along the edges: a point, then a plus shape, then a diamond", () => {
    const one = at(mesh, 0.5, 0.5);
    const plus = points(growSelection(topology, one));
    expect(spots(mesh, plus)).toBe(5);
    const diamond = points(growSelection(topology, plus));
    expect(spots(mesh, diamond)).toBe(13);
  });

  it("shrinks by one step: a 3 by 3 block in the middle becomes its middle point", () => {
    const block = [0.25, 0.5, 0.75].flatMap((x) =>
      [0.25, 0.5, 0.75].flatMap((z) => at(mesh, x, z)),
    );
    const less = points(shrinkSelection(topology, block));
    expect(spots(mesh, less)).toBe(1);
    expect(less).toEqual(at(mesh, 0.5, 0.5));
  });

  it("points on the border of the shape do not stay when shrinking", () => {
    const everything = allPoints(mesh.positions.length / 3);
    // the 5 by 5 whole plane shrinks to the inner 3 by 3
    expect(spots(mesh, points(shrinkSelection(topology, everything)))).toBe(9);
  });

  it("says so when it cannot grow or shrink", () => {
    expect(growSelection(topology, []).ok).toBe(false);
    expect(growSelection(topology, allPoints(25)).ok).toBe(false);
    expect(shrinkSelection(topology, at(mesh, 0.5, 0.5)).ok).toBe(false);
  });
});

describe("invert", () => {
  it("selects what was not, and not what was", () => {
    const mesh = plane(2);
    const topology = buildTopology(mesh);
    const one = at(mesh, 0.5, 0.5);
    const rest = points(invertSelection(topology, one));
    expect(spots(mesh, rest)).toBe(8);
    expect(rest.some((p) => one.includes(p))).toBe(false);
    expect(invertSelection(topology, allPoints(9)).ok).toBe(false);
  });
});

describe("select similar", () => {
  it("faces that point the same way: the top of a cut cube, not its sides", () => {
    const mesh = box(2);
    const topology = buildTopology(mesh);
    const top = allPoints(mesh.positions.length / 3).filter(
      (p) => Math.abs(mesh.positions[p * 3 + 1]! - 0.5) < 1e-6,
    );
    // one cell of the top: the four points at x, z in {0, 0.5}... pick the cell with the corner at (-0.5, -0.5)
    const cell = top.filter(
      (p) =>
        mesh.positions[p * 3]! <= 1e-6 && mesh.positions[p * 3 + 2]! <= 1e-6,
    );
    const found = points(selectSimilar(topology, cell, "face"));
    // the whole top (9 spots), and no side point lower down
    expect(spots(mesh, found)).toBe(9);
    expect(
      found.every((p) => Math.abs(mesh.positions[p * 3 + 1]! - 0.5) < 1e-6),
    ).toBe(true);
  });

  it("edges of the same length", () => {
    const mesh = plane(2);
    const topology = buildTopology(mesh);
    const a = at(mesh, 0, 0)[0]!;
    const b = at(mesh, 0.5, 0)[0]!;
    expect(
      edgeBetween(topology, topology.vertexOf[a]!, topology.vertexOf[b]!),
    ).toBeGreaterThanOrEqual(0);
    expect(spots(mesh, points(selectSimilar(topology, [a, b], "edge")))).toBe(
      9,
    );
  });

  it("points where as many edges meet", () => {
    const mesh = plane(2);
    const topology = buildTopology(mesh);
    const centre = at(mesh, 0.5, 0.5);
    expect(points(selectSimilar(topology, centre, "point"))).toEqual(centre);
    const corner = at(mesh, 0, 0);
    expect(spots(mesh, points(selectSimilar(topology, corner, "point")))).toBe(
      4,
    );
  });

  it("asks for what it needs", () => {
    const topology = buildTopology(plane(2));
    expect(selectSimilar(topology, [], "face").ok).toBe(false);
    expect(selectSimilar(topology, [0], "face").ok).toBe(false);
    expect(selectSimilar(topology, [0], "edge").ok).toBe(false);
  });
});

describe("outline", () => {
  it("the lid of a cylinder gives its rim, without the middle of the lid", () => {
    const mesh = tube(8, 1, true);
    const topology = buildTopology(mesh);
    // the top lid: every point at the top height (the middle and the rim)
    const lid = allPoints(mesh.positions.length / 3).filter(
      (p) => Math.abs(mesh.positions[p * 3 + 1]! - 2) < 1e-6,
    );
    const rim = points(outlineSelection(topology, lid));
    // 8 spots round the edge; the middle of the lid is not among them
    expect(spots(mesh, rim)).toBe(8);
    expect(
      rim.every(
        (p) =>
          Math.hypot(mesh.positions[p * 3]!, mesh.positions[p * 3 + 2]!) > 0.5,
      ),
    ).toBe(true);
  });

  it("a block in the middle of a plane gives the ring round it", () => {
    const mesh = plane(4);
    const topology = buildTopology(mesh);
    const block = [0.25, 0.5, 0.75].flatMap((x) =>
      [0.25, 0.5, 0.75].flatMap((z) => at(mesh, x, z)),
    );
    expect(spots(mesh, points(outlineSelection(topology, block)))).toBe(8);
  });

  it("the whole plane gives its border; a closed shape has no outline; no face selected says what to do", () => {
    const mesh = plane(2);
    const topology = buildTopology(mesh);
    expect(spots(mesh, points(outlineSelection(topology, allPoints(9))))).toBe(
      8,
    );
    const cube = box(1);
    expect(outlineSelection(buildTopology(cube), allPoints(24)).ok).toBe(false);
    expect(outlineSelection(topology, [0]).ok).toBe(false);
  });
});
