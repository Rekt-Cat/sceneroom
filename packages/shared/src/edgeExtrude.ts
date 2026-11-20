import { faceDirection, type EditMesh, type EditResult } from "./meshEdit";
import { MAX_EXTRUDE_DIVISIONS } from "./meshEdit";
import { edgeVertices, type Topology } from "./topology";

type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Extrudes edges: each selected edge is copied and pushed `distance`, and a wall joins the old edge to the new
 * one (cut into `divisions` bands). Where it goes:
 *  - an edge on the BORDER of a surface (one face) is pushed straight out along that surface, so a plane or the
 *    open rim of a bowl grows bigger (a negative distance pulls it back over itself);
 *  - an edge between two faces is pushed along the average direction of the faces, giving a fin or a ridge.
 * Edges that share a corner stay joined: the corner moves once, along the average of their directions.
 *
 * Returns the new mesh and the selection: the points of the new edge, ready to be moved further.
 */
export function extrudeEdges(
  mesh: EditMesh,
  topology: Topology,
  edges: readonly number[],
  distance: number,
  divisions = 1,
): EditResult {
  if (edges.length === 0) {
    return {
      ok: false,
      reason:
        "Select an edge first: press 2 for edge mode, then click an edge (Alt-click selects a whole loop).",
    };
  }
  if (Math.abs(distance) < 1e-9) {
    return { ok: false, reason: "Nothing would change: give it a distance." };
  }
  const steps = Math.min(
    MAX_EXTRUDE_DIVISIONS,
    Math.max(1, Math.round(divisions)),
  );
  const position = (v: number): Vec => [
    topology.vertexPositions[v * 3]!,
    topology.vertexPositions[v * 3 + 1]!,
    topology.vertexPositions[v * 3 + 2]!,
  ];

  // The direction of each edge, then of each corner (the average of its edges)
  const edgeDirection = new Map<number, Vec>();
  for (const e of edges) {
    const faces = topology.edgeFaces[e]!;
    const [a, b] = edgeVertices(topology, e);
    let direction: Vec;
    if (faces.length === 1) {
      const centre = faceCentre(topology, faces[0]!, position);
      const pa = position(a);
      const pb = position(b);
      const along = unit(sub(pb, pa));
      const mid: Vec = [
        (pa[0] + pb[0]) / 2,
        (pa[1] + pb[1]) / 2,
        (pa[2] + pb[2]) / 2,
      ];
      const away = sub(mid, centre);
      const k = dot(away, along);
      direction = unit([
        away[0] - along[0] * k,
        away[1] - along[1] * k,
        away[2] - along[2] * k,
      ]);
    } else {
      direction = faceDirection(
        mesh,
        faces.flatMap((f) => topology.faces[f]!.triangles),
      ) ?? [0, 1, 0];
    }
    edgeDirection.set(e, direction);
  }
  const cornerSum = new Map<number, Vec>();
  for (const e of edges) {
    const d = edgeDirection.get(e)!;
    for (const v of edgeVertices(topology, e)) {
      const s = cornerSum.get(v) ?? [0, 0, 0];
      cornerSum.set(v, [s[0] + d[0], s[1] + d[1], s[2] + d[2]]);
    }
  }
  const cornerDirection = new Map<number, Vec>();
  for (const [v, s] of cornerSum) {
    const d = unit(s);
    // Directions that cancel out: fall back to the first edge's own
    cornerDirection.set(
      v,
      d[0] === 0 && d[1] === 0 && d[2] === 0
        ? edgeDirection.get(
            edges.find((e) => edgeVertices(topology, e).includes(v))!,
          )!
        : d,
    );
  }

  const positions: number[] = Array.from(mesh.positions);
  // The map: a new point takes the place on the map of the point it was copied from (the wall is smeared along it)
  const uvs: number[] | null = mesh.uvs ? Array.from(mesh.uvs) : null;
  const indices: number[] = Array.from(mesh.indices);
  // One point per corner and step; step 0 is a point of the corner that is already there
  const ring = new Map<string, number>();
  const pointAt = (v: number, step: number): number => {
    if (step === 0) return topology.vertexPoints[v]![0]!;
    const key = `${v}:${step}`;
    let id = ring.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      const p = position(v);
      const d = cornerDirection.get(v)!;
      const push = (distance * step) / steps;
      positions.push(
        p[0] + d[0] * push,
        p[1] + d[1] * push,
        p[2] + d[2] * push,
      );
      if (uvs && mesh.uvs) {
        const source = topology.vertexPoints[v]![0]!;
        uvs.push(mesh.uvs[source * 2]!, mesh.uvs[source * 2 + 1]!);
      }
      ring.set(key, id);
    }
    return id;
  };
  const at = (i: number): Vec => [
    positions[i * 3]!,
    positions[i * 3 + 1]!,
    positions[i * 3 + 2]!,
  ];

  for (const e of edges) {
    const [a, b] = edgeVertices(topology, e);
    const face = topology.edgeFaces[e]![0]!;
    const faceNormal = faceDirection(mesh, topology.faces[face]!.triangles);
    for (let s = 1; s <= steps; s++) {
      const a0 = pointAt(a, s - 1);
      const b0 = pointAt(b, s - 1);
      const b1 = pointAt(b, s);
      const a1 = pointAt(a, s);
      // Wound so the wall faces the same way as the face it grows from
      const wall = cross(sub(at(b0), at(a0)), sub(at(a1), at(a0)));
      const flip = faceNormal !== null && dot(wall, faceNormal) < 0;
      if (flip) indices.push(a0, a1, b1, a0, b1, b0);
      else indices.push(a0, b0, b1, a0, b1, a1);
    }
  }

  const capPoints = new Set<number>();
  for (const e of edges) {
    for (const v of edgeVertices(topology, e)) capPoints.add(pointAt(v, steps));
  }
  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
      creases: mesh.creases,
      ...(mesh.seams ? { seams: mesh.seams } : {}),
      ...(uvs ? { uvs: Float32Array.from(uvs) } : {}),
    },
    selected: [...capPoints],
  };
}

function faceCentre(
  topology: Topology,
  face: number,
  position: (v: number) => Vec,
): Vec {
  const vs = topology.faces[face]!.vertices;
  const sum: Vec = [0, 0, 0];
  for (const v of vs) {
    const p = position(v);
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
  }
  return [sum[0] / vs.length, sum[1] / vs.length, sum[2] / vs.length];
}
