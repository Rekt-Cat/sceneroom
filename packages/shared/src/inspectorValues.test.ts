import { describe, expect, it } from "vitest";
import { normalizeHexColor } from "./color";
import {
  IDENTITY_TRANSFORM,
  MAX_ABS_VALUE,
  degreesToRadians,
  displayValue,
  editScaleProportionally,
  editTransform,
  formatNumber,
  parseNumberInput,
  parseUnitInput,
  resetTransformGroup,
  sanitizeMaterialChange,
} from "./inspectorValues";
import { sceneNodeSchema } from "./scene";
import { createNode } from "./sceneOps";

describe("parseNumberInput", () => {
  it("reads ordinary numbers", () => {
    expect(parseNumberInput("1.5")).toBe(1.5);
    expect(parseNumberInput("-2")).toBe(-2);
    expect(parseNumberInput(".5")).toBe(0.5);
    expect(parseNumberInput("+3")).toBe(3);
    expect(parseNumberInput("  4  ")).toBe(4);
    expect(parseNumberInput("5.")).toBe(5);
  });

  it("accepts a comma as the decimal mark and a trailing degree sign", () => {
    expect(parseNumberInput("1,5")).toBe(1.5);
    expect(parseNumberInput("45°")).toBe(45);
    expect(parseNumberInput("45 °")).toBe(45);
  });

  it("rejects text that is not a single number", () => {
    for (const bad of [
      "",
      " ",
      "abc",
      "1.5.2",
      "1,5,2",
      "--1",
      "1e5",
      "NaN",
      "Infinity",
      "1 2",
      ".",
    ]) {
      expect(parseNumberInput(bad), bad).toBeNull();
    }
  });

  it("rejects numbers beyond the limit", () => {
    expect(parseNumberInput(String(MAX_ABS_VALUE))).toBe(MAX_ABS_VALUE);
    expect(parseNumberInput(String(MAX_ABS_VALUE + 1))).toBeNull();
    expect(parseNumberInput("-" + String(MAX_ABS_VALUE + 1))).toBeNull();
  });
});

describe("formatNumber", () => {
  it("uses a fixed number of decimals", () => {
    expect(formatNumber(1.5, 2)).toBe("1.50");
    expect(formatNumber(0.126, 2)).toBe("0.13");
    expect(formatNumber(45, 1)).toBe("45.0");
  });

  it("never shows -0", () => {
    expect(formatNumber(-0.001, 2)).toBe("0.00");
    expect(formatNumber(-0, 1)).toBe("0.0");
  });
});

describe("editTransform", () => {
  const base = IDENTITY_TRANSFORM;

  it("changes one position value and leaves the rest alone", () => {
    const next = editTransform(base, "position", 1, "2.5");
    expect(next?.position).toEqual([0, 2.5, 0]);
    expect(next?.rotation).toEqual([0, 0, 0]);
    expect(next?.scale).toEqual([1, 1, 1]);
  });

  it("does not change the transform it was given", () => {
    editTransform(base, "position", 0, "9");
    expect(base.position).toEqual([0, 0, 0]);
  });

  it("takes rotation in degrees and stores radians", () => {
    const next = editTransform(base, "rotation", 2, "90");
    expect(next?.rotation[2]).toBeCloseTo(Math.PI / 2);
  });

  it("shows stored radians as degrees", () => {
    const t = {
      ...base,
      rotation: [0, degreesToRadians(45), 0] as [number, number, number],
    };
    expect(displayValue(t, "rotation", 1)).toBeCloseTo(45);
    expect(displayValue(t, "position", 1)).toBe(0);
  });

  it("returns null for text that is not a number", () => {
    expect(editTransform(base, "position", 0, "abc")).toBeNull();
  });

  it("refuses a scale of 0 but allows a negative scale (mirror)", () => {
    expect(editTransform(base, "scale", 0, "0")).toBeNull();
    expect(editTransform(base, "scale", 0, "-1")?.scale[0]).toBe(-1);
  });

  it("keeps the node valid for the scene schema", () => {
    const node = createNode("a", "cube");
    const transform = editTransform(node.transform, "position", 0, "3");
    expect(sceneNodeSchema.safeParse({ ...node, transform }).success).toBe(
      true,
    );
  });
});

describe("normalizeHexColor", () => {
  it("accepts 6-digit colours with or without #, in any case", () => {
    expect(normalizeHexColor("#5CC4E0")).toBe("#5cc4e0");
    expect(normalizeHexColor("5cc4e0")).toBe("#5cc4e0");
    expect(normalizeHexColor("  #FFB020 ")).toBe("#ffb020");
  });

  it("expands the short 3-digit form", () => {
    expect(normalizeHexColor("#fa0")).toBe("#ffaa00");
  });

  it("rejects everything else", () => {
    for (const bad of [
      "",
      "#",
      "#12345",
      "#1234567",
      "#ggg",
      "red",
      "rgb(1,2,3)",
      "#5cc4e0ff",
    ]) {
      expect(normalizeHexColor(bad), bad).toBeNull();
    }
  });
});

describe("parseUnitInput", () => {
  it("accepts numbers from 0 to 1", () => {
    expect(parseUnitInput("0")).toBe(0);
    expect(parseUnitInput("0.6")).toBe(0.6);
    expect(parseUnitInput(".25")).toBe(0.25);
    expect(parseUnitInput("1")).toBe(1);
    expect(parseUnitInput("0,5")).toBe(0.5);
  });

  it("rejects numbers outside 0 to 1 and text that is not a number", () => {
    for (const bad of ["-0.1", "1.01", "2", "abc", "", "0.5.5"]) {
      expect(parseUnitInput(bad), bad).toBeNull();
    }
  });
});

describe("sanitizeMaterialChange", () => {
  it("keeps valid values and clamps the ones outside 0 to 1", () => {
    expect(sanitizeMaterialChange({ roughness: 0.3, metalness: 7 })).toEqual({
      roughness: 0.3,
      metalness: 1,
    });
    expect(sanitizeMaterialChange({ roughness: -2 })).toEqual({ roughness: 0 });
  });

  it("drops anything that is not a finite number", () => {
    expect(
      sanitizeMaterialChange({ roughness: NaN, metalness: Infinity }),
    ).toEqual({});
    expect(sanitizeMaterialChange({})).toEqual({});
  });
});

describe("resetTransformGroup", () => {
  const edited = {
    position: [3, 4, 5] as [number, number, number],
    rotation: [0.1, 0.2, 0.3] as [number, number, number],
    scale: [2, 2, 2] as [number, number, number],
  };

  it("puts one part back to its starting value and leaves the others", () => {
    expect(resetTransformGroup(edited, "position")).toEqual({
      ...edited,
      position: [0, 0, 0],
    });
    expect(resetTransformGroup(edited, "rotation").rotation).toEqual([0, 0, 0]);
    expect(resetTransformGroup(edited, "scale").scale).toEqual([1, 1, 1]);
    expect(resetTransformGroup(edited, "scale").position).toEqual([3, 4, 5]);
  });

  it("does not change the transform it was given, nor share the starting arrays", () => {
    const result = resetTransformGroup(edited, "position");
    expect(edited.position).toEqual([3, 4, 5]);
    result.position[0] = 99;
    expect(IDENTITY_TRANSFORM.position).toEqual([0, 0, 0]);
  });
});

describe("editScaleProportionally (linked scale)", () => {
  const box = {
    position: [1, 2, 3] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 2, 4] as [number, number, number],
  };

  it("changes the other two by the same factor, keeping the proportions", () => {
    const next = editScaleProportionally(box, 0, "2");
    expect(next?.scale).toEqual([2, 4, 8]);
    const fromY = editScaleProportionally(box, 1, "1");
    expect(fromY?.scale).toEqual([0.5, 1, 2]);
  });

  it("gives the edited value exactly what was typed", () => {
    const next = editScaleProportionally(
      { ...box, scale: [3, 3, 3] },
      2,
      "1.1",
    );
    expect(next?.scale[2]).toBe(1.1);
    expect(next?.scale[0]).toBeCloseTo(1.1);
  });

  it("leaves position and rotation alone, and does not change the transform it was given", () => {
    const next = editScaleProportionally(box, 0, "3");
    expect(next?.position).toEqual([1, 2, 3]);
    expect(next?.rotation).toEqual([0, 0, 0]);
    expect(box.scale).toEqual([1, 2, 4]);
  });

  it("keeps a mirrored (negative) scale mirrored", () => {
    const mirrored = { ...box, scale: [-1, 2, 2] as [number, number, number] };
    expect(editScaleProportionally(mirrored, 1, "4")?.scale).toEqual([
      -2, 4, 4,
    ]);
    // typing a negative number flips the others too, so the shape keeps its look
    expect(editScaleProportionally(box, 0, "-1")?.scale).toEqual([-1, -2, -4]);
  });

  it("refuses text that is not a number, a scale of 0, and results that are too large", () => {
    expect(editScaleProportionally(box, 0, "abc")).toBeNull();
    expect(editScaleProportionally(box, 0, "0")).toBeNull();
    // 4 * 100000 / 1 would be 400000 for Z, over the limit
    expect(editScaleProportionally(box, 0, String(MAX_ABS_VALUE))).toBeNull();
  });

  it("with a zero scale on the edited axis, edits only that axis", () => {
    const flat = { ...box, scale: [0, 2, 2] as [number, number, number] };
    expect(editScaleProportionally(flat, 0, "3")?.scale).toEqual([3, 2, 2]);
  });
});
