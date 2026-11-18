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
import { meshEdges, type Crease, type Seam } from "@sceneroom/shared";
import type { SelectMode } from "@/store/editStore";

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
  /** Colours the selected points and draws the selected edges (both ends selected). */
  setSelected: (selected: readonly number[]) => void;
  /** In point mode every point has a dot; in edge and face mode only the selected ones do. */
  setMode: (mode: SelectMode) => void;
  /** X-ray on: lines and dots show through the mesh. Off: parts behind a face are hidden by it. */
  setXray: (xray: boolean) => void;
  /** Draws the creased edges (sharp ones in strong pink, softer ones paler); pass the mesh's creases. */
  setCreases: (creases: readonly Crease[] | undefined) => void;
  /** Draws the seams (the cuts for the UV map) in red; pass the mesh's seams. */
  setSeams: (seams: readonly Seam[] | undefined) => void;
  /** Shows (or, with null, hides) the lines a loop cut would make: pairs of spots (x, y, z, x, y, z, ...) in the mesh's space. */
  setCutPreview: (lines: Float32Array | null) => void;
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

  // The selected edges, drawn over the others in the selection colour, and the selected points as their
  // own dots (so they show in every mode)
  const edgePairs = meshEdges(
    index ? Uint32Array.from(index.array) : sequential(position.count),
  );
  const selectedLineGeometry = new BufferGeometry();
  selectedLineGeometry.setAttribute("position", position);
  selectedLineGeometry.setIndex(new BufferAttribute(new Uint32Array(0), 1));
  const selectedLineMaterial = new LineBasicMaterial({
    color: 0xffb020,
    depthTest: false,
    transparent: true,
  });
  const selectedLines = new LineSegments(
    selectedLineGeometry,
    selectedLineMaterial,
  );
  selectedLines.raycast = hitNothing;
  selectedLines.renderOrder = 12;
  selectedLines.frustumCulled = false;

  const selectedDotGeometry = new BufferGeometry();
  selectedDotGeometry.setAttribute("position", position);
  selectedDotGeometry.setIndex(new BufferAttribute(new Uint32Array(0), 1));
  const selectedDotMaterial = new PointsMaterial({
    size: POINT_SIZE_PX,
    sizeAttenuation: false,
    color: 0xffb020,
    depthTest: false,
    transparent: true,
  });
  const selectedDots = new Points(selectedDotGeometry, selectedDotMaterial);
  selectedDots.raycast = hitNothing;
  selectedDots.renderOrder = 13;
  selectedDots.frustumCulled = false;

  // The order matters to the tests: all edges, all points, then the selected edges and points
  // The lines a loop cut would draw (green), set while the Loop cut tool hovers over an edge
  const cutGeometry = new BufferGeometry();
  cutGeometry.setAttribute("position", new Float32BufferAttribute([], 3));
  const cutMaterial = new LineBasicMaterial({
    color: 0x58e07a,
    depthTest: false,
    transparent: true,
  });
  const cutLines = new LineSegments(cutGeometry, cutMaterial);
  cutLines.raycast = hitNothing;
  cutLines.renderOrder = 14;
  cutLines.frustumCulled = false;
  cutLines.visible = false;

  // The creased edges: sharp ones strong pink, semi-sharp ones paler, each drawn over the plain lines
  const makeCreaseLines = (color: number, order: number) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", position);
    geometry.setIndex(new BufferAttribute(new Uint32Array(0), 1));
    const material = new LineBasicMaterial({
      color,
      depthTest: false,
      transparent: true,
    });
    const object = new LineSegments(geometry, material);
    object.raycast = hitNothing;
    object.renderOrder = order;
    object.frustumCulled = false;
    return { geometry, material, object };
  };
  const softCrease = makeCreaseLines(0xf3a6cf, 12);
  const sharpCrease = makeCreaseLines(0xff3d9a, 12);
  // Seams are red, drawn over everything else so they can be followed round the shape
  const seamLines = makeCreaseLines(0xf0434a, 13);

  group.add(
    lines,
    points,
    selectedLines,
    selectedDots,
    cutLines,
    softCrease.object,
    sharpCrease.object,
    seamLines.object,
  );

  const setSelected = (selected: readonly number[]) => {
    const color = pointGeometry.getAttribute("color") as BufferAttribute;
    const array = color.array as Float32Array;
    for (let i = 0; i < position.count; i++) array.set(POINT_COLOR, i * 3);
    for (const point of selected) {
      if (point >= 0 && point < position.count)
        array.set(SELECTED_COLOR, point * 3);
    }
    color.needsUpdate = true;

    const chosen = new Set(selected);
    const lineIndex: number[] = [];
    for (let i = 0; i + 1 < edgePairs.length; i += 2) {
      const a = edgePairs[i]!;
      const b = edgePairs[i + 1]!;
      if (chosen.has(a) && chosen.has(b)) lineIndex.push(a, b);
    }
    selectedLineGeometry.setIndex(
      new BufferAttribute(Uint32Array.from(lineIndex), 1),
    );
    selectedDotGeometry.setIndex(
      new BufferAttribute(
        Uint32Array.from(
          [...chosen].filter((point) => point >= 0 && point < position.count),
        ),
        1,
      ),
    );
  };
  setSelected([]);

  const setMode = (mode: SelectMode) => {
    points.visible = mode === "point";
  };
  setMode("point");

  const setCreases = (creases: readonly Crease[] | undefined) => {
    const soft: number[] = [];
    const sharp: number[] = [];
    for (const crease of creases ?? []) {
      if (crease.a >= position.count || crease.b >= position.count) continue;
      (crease.value >= 0.99 ? sharp : soft).push(crease.a, crease.b);
    }
    softCrease.geometry.setIndex(
      new BufferAttribute(Uint32Array.from(soft), 1),
    );
    sharpCrease.geometry.setIndex(
      new BufferAttribute(Uint32Array.from(sharp), 1),
    );
  };

  const setSeams = (seams: readonly Seam[] | undefined) => {
    const pairs: number[] = [];
    for (const seam of seams ?? []) {
      if (seam.a >= position.count || seam.b >= position.count) continue;
      pairs.push(seam.a, seam.b);
    }
    seamLines.geometry.setIndex(
      new BufferAttribute(Uint32Array.from(pairs), 1),
    );
  };

  const setCutPreview = (positions: Float32Array | null) => {
    if (!positions || positions.length === 0) {
      cutLines.visible = false;
      return;
    }
    cutGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(positions, 3),
    );
    cutGeometry.computeBoundingSphere();
    cutLines.visible = true;
  };

  const setXray = (xray: boolean) => {
    // Without x-ray the overlay is hidden by the mesh in front of it (the mesh is pushed back a little by the
    // editor so lines lying on its surface are not hidden by it)
    for (const material of [
      lineMaterial,
      pointMaterial,
      selectedLineMaterial,
      selectedDotMaterial,
    ]) {
      material.depthTest = !xray;
    }
  };
  setXray(false);

  return {
    group,
    setSelected,
    setMode,
    setXray,
    setCutPreview,
    setCreases,
    setSeams,
    dispose: () => {
      group.removeFromParent();
      pointGeometry.dispose();
      lineGeometry.dispose();
      selectedLineGeometry.dispose();
      selectedDotGeometry.dispose();
      cutGeometry.dispose();
      cutMaterial.dispose();
      softCrease.geometry.dispose();
      softCrease.material.dispose();
      sharpCrease.geometry.dispose();
      sharpCrease.material.dispose();
      seamLines.geometry.dispose();
      seamLines.material.dispose();
      pointMaterial.dispose();
      lineMaterial.dispose();
      selectedLineMaterial.dispose();
      selectedDotMaterial.dispose();
    },
  };
}

/** Triangle corners 0, 1, 2 ... for a geometry that has no index (each three points are one triangle). */
function sequential(count: number): Uint32Array {
  return Uint32Array.from({ length: count }, (_, i) => i);
}
