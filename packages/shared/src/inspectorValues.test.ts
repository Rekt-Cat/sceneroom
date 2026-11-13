import { describe, expect, it } from "vitest";
import { normalizeHexColor } from "./color";
import {
  IDENTITY_TRANSFORM,
  MAX_ABS_VALUE,
  degreesToRadians,
  displayValue,
  editTransform,
  formatNumber,
  parseNumberInput,
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
