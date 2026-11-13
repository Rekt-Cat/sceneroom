import { describe, expect, it } from "vitest";
import { modeForKey } from "./transformTools";

describe("modeForKey", () => {
  it("maps W, E and R to the three modes", () => {
    expect(modeForKey("w")).toBe("translate");
    expect(modeForKey("e")).toBe("rotate");
    expect(modeForKey("r")).toBe("scale");
  });

  it("ignores case", () => {
    expect(modeForKey("W")).toBe("translate");
  });

  it("returns null for other keys, including inherited object property names", () => {
    expect(modeForKey("x")).toBeNull();
    expect(modeForKey("constructor")).toBeNull();
    expect(modeForKey("")).toBeNull();
  });
});
