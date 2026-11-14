import { describe, expect, it } from "vitest";
import { sceneNodeSchema, createEmptyScene } from "./scene";
import { addNode, createNode } from "./sceneOps";
import {
  DEFAULT_LIGHTS,
  MAX_LIGHT_INTENSITY,
  aimRotation,
  createLightNode,
  isLightNode,
  lightChangeDiffers,
  sanitizeLightChange,
  setLight,
} from "./lights";

/** Turns (0, 0, -1) by Euler angles in the order x, y, z (as three.js does), to check where a light points. */
function frontAfter(rotation: [number, number, number]): number[] {
  const [rx, ry, rz] = rotation;
  let v = [0, 0, -1];
  // XYZ order means the z turn is applied first, then y, then x
  const rotZ = ([x, y, z]: number[]) => [
    x! * Math.cos(rz) - y! * Math.sin(rz),
    x! * Math.sin(rz) + y! * Math.cos(rz),
    z!,
  ];
  const rotY = ([x, y, z]: number[]) => [
    x! * Math.cos(ry) + z! * Math.sin(ry),
    y!,
    -x! * Math.sin(ry) + z! * Math.cos(ry),
  ];
  const rotX = ([x, y, z]: number[]) => [
    x!,
    y! * Math.cos(rx) - z! * Math.sin(rx),
    y! * Math.sin(rx) + z! * Math.cos(rx),
  ];
  v = rotX(rotY(rotZ(v)));
  return v;
}

describe("aimRotation", () => {
  const cases: [string, [number, number, number], [number, number, number]][] =
    [
      ["from above and to the side", [4, 6, 3], [0, 0, 0]],
      ["straight down", [0, 5, 0], [0, 0, 0]],
      ["straight up", [0, 0, 0], [0, 5, 0]],
      ["along one axis", [0, 1, 5], [0, 1, 0]],
      ["sideways", [-3, 2, 0], [3, 2, 0]],
    ];
  it.each(cases)(
    "points the front of the light the right way: %s",
    (_name, from, to) => {
      const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
      const length = Math.hypot(...d);
      const front = frontAfter(aimRotation(from, to));
      expect(front[0]).toBeCloseTo(d[0]! / length, 5);
      expect(front[1]).toBeCloseTo(d[1]! / length, 5);
      expect(front[2]).toBeCloseTo(d[2]! / length, 5);
    },
  );
});

describe("createLightNode", () => {
  it("makes a light object with the defaults of its kind, aimed at the middle", () => {
    for (const kind of ["directional", "point", "spot"] as const) {
      const node = createLightNode("l", kind);
      expect(node.kind).toBe(kind);
      expect(node.light).toEqual(DEFAULT_LIGHTS[kind]);
      expect(isLightNode(node)).toBe(true);
      expect(sceneNodeSchema.safeParse(node).success).toBe(true);
    }
  });

  it("other objects are not lights, and an older scene's objects load with no light", () => {
    expect(isLightNode(createNode("a", "cube"))).toBe(false);
    const { light, ...old } = createNode("a", "cube");
    void light;
    expect(sceneNodeSchema.parse(old).light).toBeNull();
  });

  it("every default is within what the slider allows", () => {
    for (const kind of ["directional", "point", "spot"] as const) {
      expect(DEFAULT_LIGHTS[kind].intensity).toBeLessThanOrEqual(
        MAX_LIGHT_INTENSITY[kind],
      );
    }
  });
});

describe("sanitizeLightChange", () => {
  it("keeps the intensity inside what the kind allows", () => {
    expect(sanitizeLightChange("directional", { intensity: 50 })).toEqual({
      intensity: 10,
    });
    expect(sanitizeLightChange("point", { intensity: 50 })).toEqual({
      intensity: 50,
    });
    expect(sanitizeLightChange("spot", { intensity: -4 })).toEqual({
      intensity: 0,
    });
  });

  it("limits the other numbers, and drops what is not a number", () => {
    expect(
      sanitizeLightChange("spot", { angle: 200, penumbra: 3, range: -1 }),
    ).toEqual({ angle: 85, penumbra: 1, range: 0 });
    expect(sanitizeLightChange("spot", { angle: NaN })).toEqual({});
  });

  it("accepts a colour in any case and refuses nonsense", () => {
    expect(sanitizeLightChange("point", { color: "#FFAA00" })).toEqual({
      color: "#ffaa00",
    });
    expect(sanitizeLightChange("point", { color: "warm" })).toEqual({});
  });
});

describe("setLight and lightChangeDiffers", () => {
  it("changes some settings and keeps the others", () => {
    let scene = addNode(createEmptyScene(), createLightNode("l", "spot"));
    scene = setLight(scene, "l", { intensity: 5 });
    expect(scene.nodes["l"]?.light).toEqual({
      ...DEFAULT_LIGHTS.spot,
      intensity: 5,
    });
  });

  it("refuses an object that is not a light, or does not exist", () => {
    const scene = addNode(createEmptyScene(), createNode("a", "cube"));
    expect(() => setLight(scene, "a", { intensity: 1 })).toThrow("not a light");
    expect(() => setLight(scene, "zzz", { intensity: 1 })).toThrow(
      "does not exist",
    );
  });

  it("sees whether anything would change", () => {
    const light = DEFAULT_LIGHTS.point;
    expect(lightChangeDiffers(light, { intensity: light.intensity })).toBe(
      false,
    );
    expect(lightChangeDiffers(light, { intensity: 1 })).toBe(true);
    expect(lightChangeDiffers(light, {})).toBe(false);
  });
});
