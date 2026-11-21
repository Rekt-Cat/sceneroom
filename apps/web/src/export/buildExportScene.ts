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
  type Texture,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  BONE_PARENT,
  CHARACTER_BONES,
  boneRotation,
  buildParts,
  buildSceneTree,
  generatePlant,
  groundLift,
  proportions,
  restOffsets,
  roleColor,
  type CharacterBone,
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

/** The painted picture (colour map) of a texture file, or undefined if it is not available. */
export type TextureLookup = (assetId: string) => Texture | undefined;

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
 * - a painted picture (colour map) on a mesh is exported as its base colour texture
 * - lights: sun, bulb and torch lights (the extension `KHR_lights_punctual`)
 * - hidden objects stay in the scene but are marked invisible, and the exporter skips them
 *
 * What a GLB cannot hold is not exported: the background, fog, reflections and the built-in lights.
 */
export function buildExportScene(
  scene: Scene,
  getModel: ModelLookup,
  getMesh: MeshLookup = () => undefined,
  getTexture: TextureLookup = () => undefined,
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
    const object = buildObject(
      scene,
      entry.node,
      getModel,
      getMesh,
      getTexture,
      report,
    );
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
  getTexture: TextureLookup,
  report: ExportReport,
): Object3D | null {
  const object = createObject(
    scene,
    node,
    getModel,
    getMesh,
    getTexture,
    report,
  );
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
  getTexture: TextureLookup,
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

  if (node.kind === "plant") {
    return node.plant ? plantObject(node) : null;
  }

  if (node.kind === "character") {
    return node.character ? characterObject(node) : null;
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
  // A painted picture is drawn in its own colours (not tinted), like on screen
  const colorMap = node.material.colorMap
    ? getTexture(node.material.colorMap)
    : undefined;
  const material = new MeshStandardMaterial({
    color: colorMap ? "#ffffff" : node.color,
    map: colorMap ?? null,
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

/**
 * A character as a skeleton: a group for each bone (named like the bone, at its joint, turned by the pose),
 * each holding the meshes of the body parts attached to it. Other programs see a real bone hierarchy, so a
 * rotation of "upperArm.L" turns the arm. The pose is in the bones' turns; the body is lowered or raised onto
 * the ground like on screen.
 */
function characterObject(node: SceneNode): Object3D {
  const character = node.character!;
  const parts = buildParts(character);
  const offsets = restOffsets(proportions(character));
  const lift = groundLift(character, parts);
  const root = new Group();
  const groups = {} as Record<CharacterBone, Group>;
  for (const bone of CHARACTER_BONES) {
    const group = new Group();
    group.name = bone;
    const [x, y, z] = offsets[bone];
    group.position.set(x, bone === "hips" ? y + lift : y, z);
    group.rotation.set(...boneRotation(bone, character.pose[bone]));
    const parent = BONE_PARENT[bone];
    (parent ? groups[parent] : root).add(group);
    groups[bone] = group;
  }
  for (const part of parts) {
    const mesh = new Mesh(
      finish(buildMeshGeometry(part.mesh, []), node),
      new MeshStandardMaterial({
        color: roleColor(character, part.role),
        roughness: node.material.roughness,
        metalness: node.material.metalness,
        emissive: new Color(node.material.emissiveColor),
        emissiveIntensity: node.material.emissiveIntensity,
        opacity: node.material.opacity,
        transparent: node.material.opacity < 1,
        side: node.material.doubleSided ? DoubleSide : FrontSide,
      }),
    );
    mesh.name = `${part.bone} ${part.role}`;
    mesh.userData["exportOwned"] = true;
    groups[part.bone].add(mesh);
  }
  return root;
}

/** A plant: its wood and its leaves as two meshes (each with its own colour) in one object. */
function plantObject(node: SceneNode): Object3D {
  const plant = node.plant!;
  const { bark, leaves } = generatePlant(plant);
  const group = new Group();
  const part = (mesh: ShapeMesh, color: string, name: string) => {
    const object = new Mesh(
      finish(buildMeshGeometry(mesh, []), node),
      new MeshStandardMaterial({
        color,
        roughness: node.material.roughness,
        metalness: node.material.metalness,
        emissive: new Color(node.material.emissiveColor),
        emissiveIntensity: node.material.emissiveIntensity,
        opacity: node.material.opacity,
        transparent: node.material.opacity < 1,
        side: node.material.doubleSided ? DoubleSide : FrontSide,
      }),
    );
    object.name = name;
    object.userData["exportOwned"] = true;
    group.add(object);
  };
  part(bark, node.color, `${node.name} wood`);
  if (leaves.positions.length > 0)
    part(leaves, plant.leafColor, `${node.name} leaves`);
  return group;
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
