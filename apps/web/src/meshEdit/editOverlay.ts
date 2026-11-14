import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
} from "three";
import { meshEdges } from "@sceneroom/shared";

/** The size of a point dot, in screen pixels. */
export const POINT_SIZE_PX = 8;

/** The colours of the dots (r, g, b from 0 to 1): a point that is not selected, and one that is. */
const POINT_COLOR = [0.62, 0.78, 1];
const SELECTED_COLOR = [1, 0.69, 0.125]; // the amber used for selection everywhere in the editor

/** How strong the wire lines are drawn, 0 (not at all) to 1. */
export const WIRE_OPACITY = 0.35;

/** What is drawn over a mesh in edit mode: its wire lines and a dot on every point. */
export type EditOverlay = {
  group: Group;
  /** Colours the selected points. */
  setSelected: (selected: readonly number[]) => void;
  /** Frees what the overlay made (the points it shares with the mesh are the mesh's own). */
  dispose: () => void;
};

/** An object nothing can hit: the overlay must not take clicks or show up when the pointer looks for objects. */
const hitNothing = () => undefined;

/**
 * Builds the wire lines and point dots for a mesh geometry. They SHARE the geometry's point list (the very
 * same attribute object), so when a point is moved on the mesh the lines and dots follow with no extra
 * work; only the colours are the overlay's own. Everything is drawn on top of the mesh (no depth test), so
 * points on the far side can be seen and picked.
 */
export function buildEditOverlay(geometry: BufferGeometry): EditOverlay {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const index = geometry.index;

  const group = new Group();
  group.name = "edit overlay";

  // Dots: one per point, coloured by whether it is selected
  const colors = new Float32Array(position.count * 3);
  const pointGeometry = new BufferGeometry();
  pointGeometry.setAttribute("position", position);
  pointGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const pointMaterial = new PointsMaterial({
    size: POINT_SIZE_PX,
    sizeAttenuation: false,
    vertexColors: true,
    depthTest: false,
    transparent: true,
  });
  const points = new Points(pointGeometry, pointMaterial);
  points.raycast = hitNothing;
  points.renderOrder = 11;
  points.frustumCulled = false;

  // Lines: the edges of the mesh
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute("position", position);
  lineGeometry.setIndex(
    new BufferAttribute(
      meshEdges(
        index ? Uint32Array.from(index.array) : sequential(position.count),
      ),
      1,
    ),
  );
  const lineMaterial = new LineBasicMaterial({
    color: 0xcfe3ff,
    transparent: true,
    opacity: WIRE_OPACITY,
    depthTest: false,
  });
  const lines = new LineSegments(lineGeometry, lineMaterial);
  lines.raycast = hitNothing;
  lines.renderOrder = 10;
  lines.frustumCulled = false;

  group.add(lines, points);

  const setSelected = (selected: readonly number[]) => {
    const color = pointGeometry.getAttribute("color") as BufferAttribute;
    const array = color.array as Float32Array;
    for (let i = 0; i < position.count; i++) array.set(POINT_COLOR, i * 3);
    for (const point of selected) {
      if (point >= 0 && point < position.count)
        array.set(SELECTED_COLOR, point * 3);
    }
    color.needsUpdate = true;
  };
  setSelected([]);

  return {
    group,
    setSelected,
    dispose: () => {
      group.removeFromParent();
      pointGeometry.dispose();
      lineGeometry.dispose();
      pointMaterial.dispose();
      lineMaterial.dispose();
    },
  };
}

/** Triangle corners 0, 1, 2 ... for a geometry that has no index (each three points are one triangle). */
function sequential(count: number): Uint32Array {
  return Uint32Array.from({ length: count }, (_, i) => i);
}
