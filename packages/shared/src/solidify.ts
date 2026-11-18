import { weldGroups } from "./meshEdit";
import type { ShapeMesh } from "./modifiers";

/**
 * Solidify: gives a surface thickness. A copy of the surface is made, moved `thickness` (a share of the size of
 * the shape) against the way the surface faces and turned inside out, and the two are joined along every open
 * edge. A flat plane becomes a slab; an open shape (a bowl, a leaf, a cloth) becomes a shell; a closed shape gets
 * a hollow inside. A negative thickness grows the other way.
 *
 * Points on the same spot count as one, so a shape made of separate faces (a cube) is pushed evenly and does not
 * come apart. Past `maxPoints` nothing is done. The input is not changed.
 */
export function solidifyMesh(
  mesh: ShapeMesh,
  thickness: number,
  maxPoints: number,
): ShapeMesh {
  const count = mesh.positions.length / 3;
  if (count === 0 || mesh.indices.length === 0) return mesh;
  if (Math.abs(thickness) < 1e-9 || count * 2 > maxPoints) return mesh;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.positions[i * 3 + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  const size = Math.max(
    max[0]! - min[0]!,
    max[1]! - min[1]!,
    max[2]! - min[2]!,
  );
  const depth = thickness * (size > 1e-9 ? size : 1);

  // The direction each spot faces: the normals of its faces added up, each weighted by the angle it fills at the
  // spot (so a square cut into two triangles counts the same whichever way it is cut)
  const groups = weldGroups(mesh.positions);
  const normals = new Float64Array(groups.members.length * 3);
  const p = mesh.positions;
  /** The unit normal of a triangle and the angle it has at each of its three corners, or null if it has no area. */
  const corners = (t: number) => {
    const at = (k: number) => mesh.indices[t + k]! * 3;
    const point = (k: number): [number, number, number] => [
      p[at(k)]!,
      p[at(k) + 1]!,
      p[at(k) + 2]!,
    ];
    const pts = [point(0), point(1), point(2)];
    const sub = (a: number[], b: number[]) => [
      a[0]! - b[0]!,
      a[1]! - b[1]!,
      a[2]! - b[2]!,
    ];
    const u = sub(pts[1]!, pts[0]!);
    const v = sub(pts[2]!, pts[0]!);
    const n = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const length = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (length < 1e-12) return null;
    const angles = [0, 1, 2].map((k) => {
      const a = sub(pts[(k + 1) % 3]!, pts[k]!);
      const b = sub(pts[(k + 2) % 3]!, pts[k]!);
      const cos =
        (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) /
        (Math.hypot(a[0]!, a[1]!, a[2]!) * Math.hypot(b[0]!, b[1]!, b[2]!));
      return Math.acos(Math.min(1, Math.max(-1, cos)));
    });
    return {
      normal: [n[0]! / length, n[1]! / length, n[2]! / length] as const,
      angles,
    };
  };
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const found = corners(t);
    if (!found) continue;
    for (let k = 0; k < 3; k++) {
      const g = groups.ids[mesh.indices[t + k]!]!;
      for (let axis = 0; axis < 3; axis++) {
        normals[g * 3 + axis] =
          normals[g * 3 + axis]! + found.normal[axis]! * found.angles[k]!;
      }
    }
  }

  // Even thickness: where faces meet at an angle (a corner) the push is longer, so the wall is as thick there
  // as everywhere (1 / cos of the angle between the push and its faces, never more than twice as long)
  const cosines = new Float64Array(groups.members.length);
  const faces = new Float64Array(groups.members.length);
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const found = corners(t);
    if (!found) continue;
    for (let k = 0; k < 3; k++) {
      const g = groups.ids[mesh.indices[t + k]!]!;
      const length = Math.hypot(
        normals[g * 3]!,
        normals[g * 3 + 1]!,
        normals[g * 3 + 2]!,
      );
      if (length < 1e-12) continue;
      cosines[g] =
        cosines[g]! +
        (found.normal[0] * normals[g * 3]! +
          found.normal[1] * normals[g * 3 + 1]! +
          found.normal[2] * normals[g * 3 + 2]!) /
          length;
      faces[g] = faces[g]! + 1;
    }
  }
  const stretch = (g: number) => {
    const cos = faces[g]! > 0 ? cosines[g]! / faces[g]! : 1;
    return Math.min(2, 1 / Math.max(cos, 0.5));
  };

  // Room for the two shells; the walls' own points are added after them
  const positions: number[] = new Array<number>(count * 6).fill(0);
  for (let i = 0; i < count * 3; i++) positions[i] = mesh.positions[i]!;
  for (let i = 0; i < count; i++) {
    const g = groups.ids[i]! * 3;
    const length = Math.hypot(normals[g]!, normals[g + 1]!, normals[g + 2]!);
    for (let k = 0; k < 3; k++) {
      const n = length < 1e-12 ? 0 : normals[g + k]! / length;
      positions[(count + i) * 3 + k] =
        mesh.positions[i * 3 + k]! - n * depth * stretch(groups.ids[i]!);
    }
  }

  const triangles = mesh.indices.length / 3;
  // A negative thickness puts the copy on the front side: then the copy keeps the winding and the original flips
  const flip = depth < 0;
  const indices: number[] = [];
  for (let t = 0; t < triangles; t++) {
    const a = mesh.indices[t * 3]!;
    const b = mesh.indices[t * 3 + 1]!;
    const c = mesh.indices[t * 3 + 2]!;
    if (flip) indices.push(a, c, b, a + count, b + count, c + count);
    else indices.push(a, b, c, a + count, c + count, b + count);
  }

  // Open edges: a directed edge (by spot) whose opposite is not used by any triangle
  const directed = new Set<string>();
  const key = (a: number, b: number) => `${groups.ids[a]!}>${groups.ids[b]!}`;
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      directed.add(
        key(mesh.indices[t * 3 + k]!, mesh.indices[t * 3 + ((k + 1) % 3)]!),
      );
    }
  }
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[t * 3 + k]!;
      const b = mesh.indices[t * 3 + ((k + 1) % 3)]!;
      if (directed.has(key(b, a))) continue;
      // The wall faces away from the surface's inside, whichever side the copy is on
      // The wall has points of its own (copies of the four corners), so it keeps a crisp edge with the
      // surface instead of being shaded smoothly into it
      const own = (point: number) => {
        const id = positions.length / 3;
        positions.push(
          positions[point * 3]!,
          positions[point * 3 + 1]!,
          positions[point * 3 + 2]!,
        );
        return id;
      };
      const wa = own(a);
      const wb = own(b);
      const wa2 = own(a + count);
      const wb2 = own(b + count);
      // The wall faces away from the surface's inside, whichever side the copy is on
      if (flip) indices.push(wa, wb, wa2, wb, wb2, wa2);
      else indices.push(wb, wa, wa2, wb, wa2, wb2);
    }
  }

  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
    // The first points keep their numbers, so creases on the surface are still right
    creases: mesh.creases,
    ...(mesh.seams ? { seams: mesh.seams } : {}),
  };
}
