import {
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  SpotLight,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  buildSceneTree,
  modelOffset,
  type Scene,
  type ShapeMesh,
  type SceneNode,
  type TreeNode,
} from "@sceneroom/shared";
import {
  buildMeshGeometry,
  buildShapeGeometry,
} from "@/components/viewport/shapeGeometry";

/** The loaded three.js scene of an imported model file, or undefined if it is not available. */
export type ModelLookup = (assetId: string) => Object3D | undefined;

/** The points and triangles of an editable mesh, or undefined if its data is not available. */
export type MeshLookup = (assetId: string) => ShapeMesh | undefined;

/** What was left out of the export, so the user can be told. */
export type ExportReport = {
  objects: number;
  lights: number;
  models: number;
  /** Models whose file could not be loaded (they are left out). */
  missingModels: string[];
  /** Objects that are hidden, left out. */
  hidden: number;
};

/**
 * Builds a clean three.js scene from the scene data, for the GLB exporter. It is not the scene on
 * screen: no markers, no outlines, no ground catcher or grid. Each object keeps its place in the
 * hierarchy and its position, rotation and scale.
 *
 * - shapes: their geometry with the modifiers applied (a bent tube is exported bent), and a standard
 *   material (colour, roughness, metalness, glow, opacity, double-sided). Flat shading is exported as
 *   flat normals, because a glTF material has no flat-shading switch.
 * - models: a copy of the loaded file
 * - lights: sun, bulb and torch lights (the extension `KHR_lights_punctual`)
 * - hidden objects stay in the scene but are marked invisible, and the exporter skips them
 *
 * What a GLB cannot hold is not exported: the background, fog, reflections and the built-in lights.
 */
export function buildExportScene(
  scene: Scene,
  getModel: ModelLookup,
  getMesh: MeshLookup = () => undefined,
): { root: Group; report: ExportReport } {
  const root = new Group();
  root.name = "SceneRoom scene";
  const report: ExportReport = {
    objects: 0,
    lights: 0,
    models: 0,
    missingModels: [],
    hidden: 0,
  };
  const add = (entry: TreeNode, parent: Object3D) => {
    const object = buildObject(scene, entry.node, getModel, getMesh, report);
    if (object) {
      parent.add(object);
      for (const child of entry.children) add(child, object);
    }
  };
  for (const entry of buildSceneTree(scene)) add(entry, root);
  return { root, report };
}

function buildObject(
  scene: Scene,
  node: SceneNode,
  getModel: ModelLookup,
  getMesh: MeshLookup,
  report: ExportReport,
): Object3D | null {
  const object = createObject(scene, node, getModel, getMesh, report);
  if (!object) return null;
  object.name = node.name;
  object.visible = node.visible;
  const { position, rotation, scale } = node.transform;
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.scale.set(...scale);
  report.objects += 1;
  if (!node.visible) report.hidden += 1;
  return object;
}

function createObject(
  scene: Scene,
  node: SceneNode,
  getModel: ModelLookup,
  getMesh: MeshLookup,
  report: ExportReport,
): Object3D | null {
  if (node.light) {
    report.lights += 1;
    const { color, intensity, range, angle, penumbra } = node.light;
    switch (node.kind) {
      case "directional":
        return new DirectionalLight(color, intensity);
      case "point":
        return new PointLight(color, intensity, range, 2);
      case "spot":
        return new SpotLight(
          color,
          intensity,
          range,
          (angle * Math.PI) / 180,
          penumbra,
          2,
        );
    }
    return null;
  }

  if (node.kind === "model") {
    const info = node.assetId ? scene.assets[node.assetId] : undefined;
    const loaded = node.assetId ? getModel(node.assetId) : undefined;
    if (!info || !loaded) {
      report.missingModels.push(node.name);
      return null;
    }
    report.models += 1;
    // Like on screen: the file stands inside the object, shifted so its bottom middle is the origin
    const group = new Group();
    const inner = new Group();
    inner.position.set(...modelOffset(info));
    inner.add(clone(loaded));
    group.add(inner);
    // The object's own scale already holds the size the model was fitted to when it was placed
    return group;
  }

  let geometry: BufferGeometry;
  if (node.kind === "mesh") {
    const mesh = node.assetId ? getMesh(node.assetId) : undefined;
    if (!mesh) {
      report.missingModels.push(node.name);
      return null;
    }
    geometry = finish(buildMeshGeometry(mesh, node.modifiers), node);
  } else {
    geometry = shapeGeometry(node);
  }
  const material = new MeshStandardMaterial({
    color: node.color,
    roughness: node.material.roughness,
    metalness: node.material.metalness,
    emissive: new Color(node.material.emissiveColor),
    emissiveIntensity: node.material.emissiveIntensity,
    opacity: node.material.opacity,
    transparent: node.material.opacity < 1,
    side: node.material.doubleSided ? DoubleSide : FrontSide,
  });
  const mesh = new Mesh(geometry, material);
  // Marked so only what was made here is freed afterwards (a model's own parts are shared with the screen)
  mesh.userData["exportOwned"] = true;
  return mesh;
}

function shapeGeometry(node: SceneNode) {
  return finish(
    buildShapeGeometry(
      node.kind as Parameters<typeof buildShapeGeometry>[0],
      node.segments,
      node.modifiers,
    ),
    node,
  );
}

/** Flat shading as flat normals (see below); a smooth object is left as it is. */
function finish(geometry: BufferGeometry, node: SceneNode): BufferGeometry {
  if (!node.material.flatShading) return geometry;
  // Flat shading as flat normals: every triangle gets its own points, so its corners do not share a normal
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}

/** Frees the geometries and materials made for an export. */
export function disposeExportScene(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) || object.userData["exportOwned"] !== true) {
      return;
    }
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material.dispose();
  });
}
