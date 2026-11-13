import { describe, expect, it } from "vitest";
import { normalizeNodeName } from "./nodeName";

describe("normalizeNodeName", () => {
  it("trims spaces around a name", () => {
    expect(normalizeNodeName("  Tree  ")).toBe("Tree");
  });

  it("rejects empty and whitespace-only names", () => {
    expect(normalizeNodeName("")).toBeNull();
    expect(normalizeNodeName("   ")).toBeNull();
  });

  it("rejects names longer than 100 characters", () => {
    expect(normalizeNodeName("a".repeat(100))).toBe("a".repeat(100));
    expect(normalizeNodeName("a".repeat(101))).toBeNull();
  });
});
