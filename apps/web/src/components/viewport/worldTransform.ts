import { Euler, Matrix4, Quaternion, Vector3, type Object3D } from "three";
import type { Transform } from "@sceneroom/shared";

/**
 * The transform `object` needs so that it stays exactly where it is in the 3D view when it is
 * placed under `newParent` (null = top level). Both must be in the scene right now, because their
 * world positions are read from the three.js objects.
 *
 * With a parent that has a different, non-even scale and an object turned at an angle, three.js
 * cannot always express the result as a plain position / rotation / scale; the closest one is used.
 */
export function localTransformUnder(
  object: Object3D,
  newParent: Object3D | null,
): Transform {
  object.updateWorldMatrix(true, false);
  const local = object.matrixWorld.clone();
  if (newParent) {
    newParent.updateWorldMatrix(true, false);
    local.premultiply(new Matrix4().copy(newParent.matrixWorld).invert());
  }
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  local.decompose(position, rotation, scale);
  const euler = new Euler().setFromQuaternion(rotation, "XYZ");
  return {
    position: [position.x, position.y, position.z],
    rotation: [euler.x, euler.y, euler.z],
    scale: [scale.x, scale.y, scale.z],
  };
}
