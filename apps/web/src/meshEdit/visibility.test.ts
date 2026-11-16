import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three";
import { visiblePoints, visibleSpots } from "./visibility";

function scene() {
  const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  box.updateMatrixWorld();
  const camera = new PerspectiveCamera(50, 1.6, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.updateMatrixWorld();
  return { box, camera };
}

describe("what the camera can see of a mesh", () => {
  it("a corner on the near side is visible, the same corner on the far side is hidden by the cube", () => {
    const { box, camera } = scene();
    const seen = visibleSpots(
      [
        [0.5, 0.5, 0.5],
        [0.5, 0.5, -0.5],
        [0, 0, 0],
      ],
      box,
      camera,
    );
    expect(seen).toEqual([true, false, false]); // the middle is inside: the front face is in the way
  });

  it("a point beside the cube (nothing in the way) is visible", () => {
    const { box, camera } = scene();
    expect(visibleSpots([[3, 0, -4]], box, camera)).toEqual([true]);
  });

  it("follows the object when it moves or turns", () => {
    const { box, camera } = scene();
    box.rotation.y = Math.PI; // turned round: the +z corner is now at the back
    box.position.set(0, 0, 0);
    box.updateMatrixWorld();
    // a spot at local z +0.5 is now at world z -0.5, hidden
    expect(visibleSpots([[0.5, 0.5, 0.5]], box, camera)).toEqual([false]);
    expect(visibleSpots([[0.5, 0.5, -0.5]], box, camera)).toEqual([true]);
  });

  it("keeps the order of the candidates and drops the hidden ones", () => {
    const { box, camera } = scene();
    // positions of 4 points: 0 near, 1 far, 2 near, 3 far
    const positions = [
      0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5,
    ];
    expect(visiblePoints([3, 2, 1, 0], positions, box, camera)).toEqual([2, 0]);
    expect(visiblePoints([], positions, box, camera)).toEqual([]);
  });
});
