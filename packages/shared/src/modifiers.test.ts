import { describe, expect, it } from "vitest";
import { createEmptyScene, sceneNodeSchema, type Modifier } from "./scene";
import { addNode, createModelNode, createNode } from "./sceneOps";
import {
  addModifier,
  createModifier,
  deformPoints,
  describeModifier,
  duplicateModifier,
  nextAxis,
  modifierChangeDiffers,
  moveModifier,
  removeModifier,
  sanitizeModifierChange,
  setModifier,
  setSegments,
  supportsModifiers,
} from "./modifiers";

/** A straight rod along y from -1 to 1, as points. */
const rod = () => new Float32Array([0, -1, 0, 0, 0, 0, 0, 1, 0]);

describe("deformPoints: twist", () => {
  it("turns the ends in opposite directions and leaves the middle", () => {
    const twist: Modifier = {
      ...createModifier("t", "twist"),
      angle: 90,
    } as Modifier;
    // a point one unit out to the side at the bottom, the middle and the top
    const points = new Float32Array([1, -1, 0, 1, 0, 0, 1, 1, 0]);
    const out = deformPoints(points, [twist]);
    // the middle slice is not turned
    expect(out[3]).toBeCloseTo(1);
    expect(out[5]).toBeCloseTo(0);
    // the top is turned by half the angle (45 degrees), the bottom by minus half. A positive angle
    // follows the right-hand rule about the axis, like rotations in three.js: about +y it turns x
    // towards -z, so the angle measured from x towards z is negative at the top.
    expect(Math.atan2(out[8]!, out[6]!)).toBeCloseTo(-Math.PI / 4);
    expect(Math.atan2(out[2]!, out[0]!)).toBeCloseTo(Math.PI / 4);
    // turning never changes how far a point is from the axis
    expect(Math.hypot(out[6]!, out[8]!)).toBeCloseTo(1);
  });
});

describe("deformPoints: taper", () => {
  it("scales the far end by 1 - amount and leaves the near end", () => {
    const taper: Modifier = {
      ...createModifier("t", "taper"),
      amount: 0.5,
    } as Modifier;
    const points = new Float32Array([1, -1, 1, 1, 0, 1, 1, 1, 1]);
    const out = deformPoints(points, [taper]);
    expect([out[0], out[2]]).toEqual([1, 1]); // bottom (the start): unchanged
    expect(out[3]).toBeCloseTo(0.75); // middle: halfway
    expect(out[6]).toBeCloseTo(0.5); // top: half size
    expect(out[8]).toBeCloseTo(0.5);
  });

  it("a negative amount makes the far end wider", () => {
    const taper: Modifier = {
      ...createModifier("t", "taper"),
      amount: -1,
    } as Modifier;
    const out = deformPoints(new Float32Array([1, -1, 0, 1, 1, 0]), [taper]);
    expect(out[3]).toBeCloseTo(2);
  });
});

describe("deformPoints: bend", () => {
  it("lays the rod along an arc: the middle stays, the ends curve towards +z", () => {
    const bend: Modifier = {
      ...createModifier("b", "bend"),
      angle: 90,
    } as Modifier;
    const out = deformPoints(rod(), [bend]);
    // the middle point stays at the origin
    expect(out[3]).toBeCloseTo(0);
    expect(out[4]).toBeCloseTo(0);
    expect(out[5]).toBeCloseTo(0);
    // the length is 2 and the angle is 90 degrees, so the radius is 2 / (pi / 2)
    const r = 2 / (Math.PI / 2);
    // the top end is a quarter of the way round... half of the 90 degrees: 45 degrees
    expect(out[7]).toBeCloseTo(r * Math.sin(Math.PI / 4));
    expect(out[8]).toBeCloseTo(r * (1 - Math.cos(Math.PI / 4)));
    // the two ends are mirror images of each other
    expect(out[1]).toBeCloseTo(-out[7]!);
    expect(out[2]).toBeCloseTo(out[8]!);
  });

  it("keeps the length of the centre line (the rod bends, it does not stretch)", () => {
    const bend: Modifier = {
      ...createModifier("b", "bend"),
      angle: 180,
    } as Modifier;
    const out = deformPoints(rod(), [bend]);
    // arc length from the middle to the top = r * (angle / 2) = length / 2 = 1
    const r = 2 / Math.PI;
    const arc = r * Math.acos(1 - out[8]! / r);
    expect(arc).toBeCloseTo(1);
  });

  it("a negative angle bends the other way, and zero changes nothing", () => {
    const left = deformPoints(rod(), [
      { ...createModifier("b", "bend"), angle: -90 } as Modifier,
    ]);
    expect(left[8]).toBeLessThan(0);
    const none = deformPoints(rod(), [
      { ...createModifier("b", "bend"), angle: 0 } as Modifier,
    ]);
    expect(Array.from(none)).toEqual(Array.from(rod()));
  });

  it("works along another axis", () => {
    const bend: Modifier = {
      ...createModifier("b", "bend"),
      axis: "x",
      angle: 90,
    } as Modifier;
    const points = new Float32Array([-1, 0, 0, 0, 0, 0, 1, 0, 0]);
    const out = deformPoints(points, [bend]);
    // along x, the arc curves towards the next direction, y
    expect(out[7]).toBeGreaterThan(0);
    expect(out[8]).toBeCloseTo(0);
  });
});

describe("deformPoints: general", () => {
  it("does not change the input, and gives a copy when nothing applies", () => {
    const points = rod();
    const out = deformPoints(points, []);
    expect(out).not.toBe(points);
    expect(Array.from(out)).toEqual(Array.from(points));
    const off: Modifier = {
      ...createModifier("b", "bend"),
      enabled: false,
    } as Modifier;
    deformPoints(points, [off]);
    expect(Array.from(points)).toEqual([0, -1, 0, 0, 0, 0, 0, 1, 0]);
  });

  it("a switched-off modifier does nothing", () => {
    const off: Modifier = {
      ...createModifier("t", "twist"),
      enabled: false,
    } as Modifier;
    const points = new Float32Array([1, -1, 0, 1, 1, 0]);
    expect(Array.from(deformPoints(points, [off]))).toEqual(Array.from(points));
  });

  it("a shape with no length along the axis is left alone", () => {
    const flat = new Float32Array([-1, 0, 0, 1, 0, 0]);
    const bend = createModifier("b", "bend"); // along y
    expect(Array.from(deformPoints(flat, [bend]))).toEqual(Array.from(flat));
  });

  it("applies modifiers in order, so the order matters", () => {
    const points = new Float32Array([1, -1, 0, 1, 1, 0, -1, 1, 0]);
    const twist: Modifier = {
      ...createModifier("a", "twist"),
      angle: 90,
    } as Modifier;
    const bend: Modifier = {
      ...createModifier("b", "bend"),
      angle: 90,
    } as Modifier;
    const one = deformPoints(points, [twist, bend]);
    const two = deformPoints(points, [bend, twist]);
    expect(Array.from(one)).not.toEqual(Array.from(two));
  });
});

describe("modifier operations on a scene", () => {
  const cube = () => addNode(createEmptyScene(), createNode("a", "cube"));

  it("adds, changes, moves and removes modifiers without touching the original", () => {
    const empty = cube();
    let scene = addModifier(empty, "a", createModifier("m1", "bend"));
    scene = addModifier(scene, "a", createModifier("m2", "twist"));
    expect(scene.nodes["a"]?.modifiers.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(empty.nodes["a"]?.modifiers).toEqual([]);

    scene = setModifier(scene, "a", "m1", { angle: 10 });
    expect((scene.nodes["a"]?.modifiers[0] as { angle: number }).angle).toBe(
      10,
    );

    scene = moveModifier(scene, "a", "m2", "up");
    expect(scene.nodes["a"]?.modifiers.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(moveModifier(scene, "a", "m2", "up")).toBe(scene); // already first

    scene = removeModifier(scene, "a", "m2");
    expect(scene.nodes["a"]?.modifiers.map((m) => m.id)).toEqual(["m1"]);
    expect(removeModifier(scene, "a", "nope")).toBe(scene);
  });

  it("refuses models and lights, and a ninth modifier", () => {
    const model = addNode(
      createEmptyScene(),
      createModelNode("m", "Car", "x", 1),
    );
    expect(() => addModifier(model, "m", createModifier("z", "bend"))).toThrow(
      "cannot have modifiers",
    );
    let scene = cube();
    for (let i = 0; i < 8; i++)
      scene = addModifier(scene, "a", createModifier(`m${i}`, "bend"));
    expect(() =>
      addModifier(scene, "a", createModifier("extra", "bend")),
    ).toThrow("at most 8");
    expect(supportsModifiers(createNode("a", "cone"))).toBe(true);
    expect(supportsModifiers(createModelNode("m", "Car", "x", 1))).toBe(false);
  });

  it("sets segments between 1 and the most allowed, as whole numbers", () => {
    const scene = cube();
    expect(setSegments(scene, "a", 8).nodes["a"]?.segments).toBe(8);
    expect(setSegments(scene, "a", 999).nodes["a"]?.segments).toBe(32);
    expect(setSegments(scene, "a", 0).nodes["a"]).toBe(scene.nodes["a"]);
    expect(setSegments(scene, "a", 3.6).nodes["a"]?.segments).toBe(4);
    expect(setSegments(scene, "a", NaN)).toBe(scene);
  });

  it("an older object loads with segments 1 and no modifiers", () => {
    const { segments, modifiers, ...old } = createNode("a", "cube");
    void segments;
    void modifiers;
    const parsed = sceneNodeSchema.parse(old);
    expect(parsed.segments).toBe(1);
    expect(parsed.modifiers).toEqual([]);
  });

  it("the schema refuses a modifier with a value out of range", () => {
    const node = createNode("a", "cube");
    const bad = {
      ...node,
      modifiers: [{ ...createModifier("m", "bend"), angle: 999 }],
    };
    expect(sceneNodeSchema.safeParse(bad).success).toBe(false);
  });
});

describe("sanitizeModifierChange", () => {
  const bend = createModifier("b", "bend");
  const taper = createModifier("t", "taper");

  it("keeps numbers inside the range of the kind", () => {
    expect(sanitizeModifierChange(bend, { angle: 999 })).toEqual({
      angle: 360,
    });
    expect(
      sanitizeModifierChange(createModifier("w", "twist"), { angle: -999 }),
    ).toEqual({ angle: -720 });
    expect(sanitizeModifierChange(taper, { amount: 5 })).toEqual({ amount: 1 });
  });

  it("drops settings that do not belong, and nonsense", () => {
    expect(sanitizeModifierChange(taper, { angle: 10 })).toEqual({});
    expect(sanitizeModifierChange(bend, { amount: 0.2 })).toEqual({});
    expect(sanitizeModifierChange(bend, { angle: NaN })).toEqual({});
    expect(sanitizeModifierChange(bend, { axis: "w" as never })).toEqual({});
    expect(sanitizeModifierChange(bend, { enabled: "yes" as never })).toEqual(
      {},
    );
  });

  it("accepts the axis and the on / off switch", () => {
    expect(sanitizeModifierChange(bend, { axis: "z", enabled: false })).toEqual(
      { axis: "z", enabled: false },
    );
  });

  it("sees whether anything would change", () => {
    expect(modifierChangeDiffers(bend, { angle: 45 })).toBe(false);
    expect(modifierChangeDiffers(bend, { angle: 46 })).toBe(true);
    expect(modifierChangeDiffers(bend, {})).toBe(false);
  });
});

describe("duplicateModifier", () => {
  it("puts the copy right after the original, with its own id and the same settings", () => {
    let scene = addNode(createEmptyScene(), createNode("a", "cube"));
    scene = addModifier(scene, "a", {
      ...createModifier("m1", "bend"),
      angle: 30,
    } as Modifier);
    scene = addModifier(scene, "a", createModifier("m2", "twist"));
    const next = duplicateModifier(scene, "a", "m1", "copy");
    expect(next.nodes["a"]?.modifiers.map((m) => m.id)).toEqual([
      "m1",
      "copy",
      "m2",
    ]);
    expect(next.nodes["a"]?.modifiers[1]).toMatchObject({
      type: "bend",
      angle: 30,
    });
    expect(scene.nodes["a"]?.modifiers).toHaveLength(2);
  });

  it("does nothing for an unknown modifier or a full list", () => {
    let scene = addNode(createEmptyScene(), createNode("a", "cube"));
    scene = addModifier(scene, "a", createModifier("m0", "bend"));
    expect(duplicateModifier(scene, "a", "nope", "x")).toBe(scene);
    for (let i = 1; i < 8; i++)
      scene = addModifier(scene, "a", createModifier(`m${i}`, "bend"));
    expect(duplicateModifier(scene, "a", "m0", "x")).toBe(scene);
  });
});

describe("describeModifier", () => {
  it("says in plain words what the modifier does and along which axis", () => {
    expect(describeModifier(createModifier("b", "bend"))).toBe(
      "Bends along Y (up), curving towards Z (forward).",
    );
    expect(
      describeModifier({
        ...createModifier("b", "bend"),
        axis: "z",
      } as Modifier),
    ).toBe("Bends along Z (forward), curving towards X (sideways).");
    expect(describeModifier(createModifier("t", "twist"))).toContain(
      "around Y (up)",
    );
    expect(describeModifier(createModifier("p", "taper"))).toContain("thinner");
    expect(
      describeModifier({
        ...createModifier("p", "taper"),
        amount: -0.5,
      } as Modifier),
    ).toContain("wider");
  });

  it("nextAxis goes round x, y, z", () => {
    expect([nextAxis("x"), nextAxis("y"), nextAxis("z")]).toEqual([
      "y",
      "z",
      "x",
    ]);
  });
});
