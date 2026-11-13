import { describe, expect, it } from "vitest";
import { Euler, Object3D, Vector3 } from "three";
import { localTransformUnder } from "./worldTransform";

/** Puts `child` under `parent` using a stored transform, the way the scene does, and returns its world position. */
function worldPositionAfterAttaching(
  parent: Object3D,
  child: Object3D,
  t: ReturnType<typeof localTransformUnder>,
) {
  const placed = new Object3D();
  placed.position.set(...t.position);
  placed.rotation.set(...t.rotation);
  placed.scale.set(...t.scale);
  parent.add(placed);
  placed.updateWorldMatrix(true, false);
  void child;
  return placed.getWorldPosition(new Vector3());
}

function makeParent() {
  const root = new Object3D();
  const parent = new Object3D();
  parent.position.set(10, 0, -4);
  parent.rotation.set(0, Math.PI / 2, 0);
  parent.scale.set(2, 2, 2);
  root.add(parent);
  root.updateWorldMatrix(true, true);
  return { root, parent };
}

describe("localTransformUnder", () => {
  it("is the same transform when moving to the top level of an object already there", () => {
    const root = new Object3D();
    const child = new Object3D();
    child.position.set(1, 2, 3);
    child.rotation.set(0.1, 0.2, 0.3);
    child.scale.set(1, 2, 1);
    root.add(child);
    const t = localTransformUnder(child, null);
    expect(t.position).toEqual([1, 2, 3]);
    expect(t.scale[1]).toBeCloseTo(2);
    expect(t.rotation[2]).toBeCloseTo(0.3);
  });

  it("keeps the world position when going under a moved, turned and scaled parent", () => {
    const { root, parent } = makeParent();
    const child = new Object3D();
    child.position.set(3, 1, 5);
    root.add(child);
    child.updateWorldMatrix(true, false);
    const before = child.getWorldPosition(new Vector3());

    const t = localTransformUnder(child, parent);
    const after = worldPositionAfterAttaching(parent, child, t);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(after.z).toBeCloseTo(before.z);
  });

  it("keeps the world position when going from under a parent to the top level", () => {
    const { root, parent } = makeParent();
    const child = new Object3D();
    child.position.set(1, 2, 3);
    child.rotation.set(0, 0.5, 0);
    parent.add(child);
    root.updateWorldMatrix(true, true);
    const before = child.getWorldPosition(new Vector3());

    const t = localTransformUnder(child, null);
    const topLevel = new Object3D();
    topLevel.position.set(...t.position);
    topLevel.rotation.copy(new Euler(...t.rotation));
    topLevel.scale.set(...t.scale);
    root.add(topLevel);
    topLevel.updateWorldMatrix(true, false);
    const after = topLevel.getWorldPosition(new Vector3());
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(after.z).toBeCloseTo(before.z);
  });

  it("scales a child down when it goes under a scaled-up parent, so it keeps its size", () => {
    const { root, parent } = makeParent(); // parent scale 2
    const child = new Object3D();
    child.scale.set(1, 1, 1);
    root.add(child);
    const t = localTransformUnder(child, parent);
    expect(t.scale[0]).toBeCloseTo(0.5);
  });
});
