import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
} from "three";
import { rectsOverlap } from "@sceneroom/shared";
import { screenBoundsOf, worldBoxOf } from "./screenBounds";

const view = { left: 300, top: 50, width: 800, height: 600 };

function camera() {
  const cam = new PerspectiveCamera(50, view.width / view.height, 0.1, 1000);
  cam.position.set(5, 4, 7);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

const cubeMesh = () =>
  new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());

describe("screenBoundsOf", () => {
  it("puts a cube at the origin in the middle of the view", () => {
    const rect = screenBoundsOf(cubeMesh(), camera(), view)!;
    expect(rect).not.toBeNull();
    const centreX = (rect.left + rect.right) / 2;
    const centreY = (rect.top + rect.bottom) / 2;
    // the outline of a box seen in perspective is not exactly centred, so allow a few pixels
    expect(Math.abs(centreX - (view.left + view.width / 2))).toBeLessThan(5);
    expect(Math.abs(centreY - (view.top + view.height / 2))).toBeLessThan(5);
    expect(rect.right).toBeGreaterThan(rect.left);
    expect(rect.bottom).toBeGreaterThan(rect.top);
  });

  it("a box dragged around the middle of the view touches the cube; one in a far corner does not", () => {
    const rect = screenBoundsOf(cubeMesh(), camera(), view)!;
    const around = { left: 600, top: 250, right: 800, bottom: 450 };
    const corner = { left: 310, top: 60, right: 360, bottom: 110 };
    expect(rectsOverlap(rect, around)).toBe(true);
    expect(rectsOverlap(rect, corner)).toBe(false);
  });

  it("follows the object's position (a moved cube lands somewhere else)", () => {
    const moved = cubeMesh();
    moved.position.set(-3, 0, 0);
    const a = screenBoundsOf(cubeMesh(), camera(), view)!;
    const b = screenBoundsOf(moved, camera(), view)!;
    expect(b.left).not.toBeCloseTo(a.left, 0);
  });

  it("works for a group such as an imported model (the box around everything inside)", () => {
    const model = new Group();
    const part = cubeMesh();
    part.position.set(0.5, 0, 0);
    model.add(part);
    model.scale.set(2, 2, 2);
    const rect = screenBoundsOf(model, camera(), view);
    expect(rect).not.toBeNull();
    const own = screenBoundsOf(cubeMesh(), camera(), view)!;
    // twice the size, so it covers more of the screen than the plain cube
    expect(rect!.right - rect!.left).toBeGreaterThan(own.right - own.left);
  });

  it("an empty group has no box, so it cannot be hit by the selection box", () => {
    expect(worldBoxOf(new Group())).toBeNull();
    expect(screenBoundsOf(new Group(), camera(), view)).toBeNull();
  });

  it("a shape inside a parent uses the parent's position, and its own shape only (not its children)", () => {
    const parent = cubeMesh();
    parent.position.set(0, 0, 0);
    const child = cubeMesh();
    child.position.set(50, 0, 0); // far away
    parent.add(child);
    const rect = screenBoundsOf(parent, camera(), view)!;
    const alone = screenBoundsOf(cubeMesh(), camera(), view)!;
    expect(rect.right - rect.left).toBeCloseTo(alone.right - alone.left, 3);
  });

  it("an object behind the camera gives no rectangle", () => {
    const behind = cubeMesh();
    behind.position.set(30, 24, 42); // beyond the camera, on the far side of it
    expect(screenBoundsOf(behind, camera(), view)).toBeNull();
  });
});
