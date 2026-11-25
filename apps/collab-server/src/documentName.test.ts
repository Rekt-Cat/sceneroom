import { describe, expect, it } from "vitest";
import { parseDocumentName } from "./documentName";

describe("parseDocumentName", () => {
  it("reads a project and a scene document", () => {
    expect(parseDocumentName("project:p1")).toEqual({
      kind: "project",
      projectId: "p1",
    });
    expect(parseDocumentName("scene:p1:s_2")).toEqual({
      kind: "scene",
      projectId: "p1",
      sceneId: "s_2",
    });
  });

  it.each([
    "",
    "project",
    "project:",
    "scene:p1",
    "scene:p1:",
    "scene:p1:s1:extra",
    "project:p1:s1",
    "other:p1",
    "scene:p 1:s1",
    "scene:../x:s1",
    `project:${"a".repeat(65)}`,
  ])("refuses %j", (name) => {
    expect(parseDocumentName(name)).toBeNull();
  });
});
