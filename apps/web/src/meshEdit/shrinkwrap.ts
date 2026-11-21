import { PRIMITIVE_KINDS, shrinkwrapFromCentre } from "@sceneroom/shared";
import { Box3, Matrix4, Vector3, type Mesh } from "three";
import { loadMeshData } from "@/assets/meshStorage";
import { getMesh } from "@/components/viewport/meshRegistry";
import { useEditStore } from "@/store/editStore";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { commitMeshPositions } from "./commitMeshEdit";

/** Below this many points a wrapped shape cannot look round, so the message says to Divide first. */
const FEW_POINTS = 100;

const say = (text: string, tone: "info" | "error" = "error") =>
  useImportStore.getState().setMessage({ tone, text });

/** The scene objects a mesh can be shrinkwrapped onto: everything shown that has a surface, except the one being edited. */
export function shrinkwrapTargets(
  scene: ReturnType<typeof useSceneStore.getState>["scene"],
  editedId: string,
): { id: string; name: string }[] {
  return Object.values(scene.nodes)
    .filter(
      (node) =>
        node.id !== editedId &&
        (node.kind === "mesh" ||
          node.kind === "model" ||
          (PRIMITIVE_KINDS as readonly string[]).includes(node.kind)),
    )
    .map((node) => ({ id: node.id, name: node.name }));
}

/** The first three.js mesh at or under an object (an imported model is a group of meshes). */
export function firstMesh(object: Mesh | undefined | null): Mesh | null {
  if (!object) return null;
  if (object.isMesh) return object;
  let found: Mesh | null = null;
  object.traverse((child) => {
    if (!found && (child as Mesh).isMesh) found = child as Mesh;
  });
  return found;
}

/**
 * Shrinkwrap: pulls the selected points (all points when none are selected) of the mesh being edited onto the surface
 * of another object, each to the closest spot on it, as it is shown now (modifiers and the object's own position,
 * turn and size included). Only the points move; triangles, seams and the UV map stay. One undo step.
 */
export async function shrinkwrapToObject(targetId: string): Promise<boolean> {
  const edit = useEditStore.getState();
  const { nodeId } = edit;
  const node = nodeId
    ? useSceneStore.getState().scene.nodes[nodeId]
    : undefined;
  if (!nodeId || !node?.assetId || node.kind !== "mesh") return false;
  if (targetId === nodeId) {
    say("Choose a different object to wrap onto.");
    return false;
  }
  const editedObject = getMesh(nodeId);
  const targetMesh = firstMesh(getMesh(targetId) as Mesh | undefined);
  const geometry = targetMesh?.geometry;
  const position = geometry?.getAttribute("position");
  if (!editedObject || !targetMesh || !geometry || !position) {
    say("The target object is not on screen, so it cannot be wrapped onto.");
    return false;
  }
  try {
    const mesh = await loadMeshData(node.assetId);
    editedObject.updateWorldMatrix(true, false);
    targetMesh.updateWorldMatrix(true, false);
    // Edited space -> world -> target space, and back
    const toTarget = new Matrix4()
      .copy(targetMesh.matrixWorld)
      .invert()
      .multiply(editedObject.matrixWorld);
    const back = toTarget.clone().invert();

    const count = mesh.positions.length / 3;
    const chosen =
      edit.selected.length > 0
        ? [...edit.selected].filter((p) => p < count)
        : Array.from({ length: count }, (_, p) => p);
    const inTarget = new Float32Array(mesh.positions);
    const v = new Vector3();
    for (let p = 0; p < count; p++) {
      v.fromArray(mesh.positions, p * 3)
        .applyMatrix4(toTarget)
        .toArray(inTarget, p * 3);
    }
    // Every point is pushed out from one middle until it meets the target. The mesh's middle is moved onto the target's
    // middle first, so the mesh covers the whole target even when it stands beside it instead of inside it.
    const meshBounds = new Box3();
    for (let p = 0; p < count; p++) {
      meshBounds.expandByPoint(v.fromArray(inTarget, p * 3));
    }
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const centre = geometry.boundingBox!.getCenter(new Vector3());
    const shift = centre.clone().sub(meshBounds.getCenter(new Vector3()));
    for (let p = 0; p < count; p++) {
      inTarget[p * 3] += shift.x;
      inTarget[p * 3 + 1] += shift.y;
      inTarget[p * 3 + 2] += shift.z;
    }
    const index = geometry.index;
    const wrapped = shrinkwrapFromCentre(
      inTarget,
      chosen,
      [centre.x, centre.y, centre.z],
      {
        positions: position.array,
        indices: index
          ? index.array
          : Uint32Array.from({ length: position.count }, (_, i) => i),
      },
    );
    if (!wrapped.ok) {
      say(wrapped.reason);
      return false;
    }
    const snapped = wrapped.positions;
    const positions = new Float32Array(mesh.positions);
    for (const p of chosen) {
      v.fromArray(snapped, p * 3)
        .applyMatrix4(back)
        .toArray(positions, p * 3);
    }
    // How many points really moved (a wrap that moves nothing must not look like a success)
    let moved = 0;
    for (const p of chosen) {
      if (
        Math.abs(positions[p * 3]! - mesh.positions[p * 3]!) > 1e-6 ||
        Math.abs(positions[p * 3 + 1]! - mesh.positions[p * 3 + 1]!) > 1e-6 ||
        Math.abs(positions[p * 3 + 2]! - mesh.positions[p * 3 + 2]!) > 1e-6
      ) {
        moved++;
      }
    }
    const targetName =
      useSceneStore.getState().scene.nodes[targetId]?.name ?? "the target";
    if (moved === 0) {
      say(
        `Nothing moved: the ${chosen.length} point${chosen.length === 1 ? " is" : "s are"} already on "${targetName}" (or cannot be wrapped onto it). If you already wrapped this mesh, undo that first, or start from a fresh shape.`,
      );
      return false;
    }
    if (!(await commitMeshPositions(nodeId, positions, "Shrinkwrap")))
      return false;
    say(
      `Wrapped ${moved} of ${chosen.length} point${chosen.length === 1 ? "" : "s"} onto "${targetName}"${wrapped.missed > 0 ? ` (${wrapped.missed} had no surface in their direction and went to the closest spot)` : ""}.${chosen.length < FEW_POINTS ? " Only the points move, so a shape with few points stays blocky: undo, Divide it first, then wrap again." : ""}`,
      "info",
    );
    return true;
  } catch (error) {
    console.error("Shrinkwrap failed:", error);
    say("Could not wrap the mesh. Please try again.");
    return false;
  }
}
