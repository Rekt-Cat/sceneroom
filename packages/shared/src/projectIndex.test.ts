import { describe, expect, it } from "vitest";
import {
  createEmptyScene,
  createProject,
  entryFor,
  initialsOf,
  projectIndexSchema,
  searchEntries,
  sortEntries,
  timeAgo,
  withEntry,
  withoutEntry,
  EMPTY_PROJECT_INDEX,
} from "./index";

const entry = (id: string, name: string, updatedAt: number) => ({
  id,
  name,
  createdAt: 1,
  updatedAt,
  scenes: 1,
});

describe("project index", () => {
  it("makes a card entry from a project", () => {
    const project = { ...createProject("s", createEmptyScene()), name: "Town" };
    expect(entryFor("p1", project, 10, 20)).toEqual({
      id: "p1",
      name: "Town",
      createdAt: 10,
      updatedAt: 20,
      scenes: 1,
    });
  });
  it("adds, replaces and removes entries", () => {
    let index = withEntry(EMPTY_PROJECT_INDEX, entry("a", "A", 1));
    index = withEntry(index, entry("b", "B", 2));
    index = withEntry(index, entry("a", "A2", 3));
    expect(index.projects.map((p) => p.name).sort()).toEqual(["A2", "B"]);
    expect(withoutEntry(index, "a").projects.map((p) => p.id)).toEqual(["b"]);
    expect(projectIndexSchema.safeParse(index).success).toBe(true);
  });
  it("rejects a broken index", () => {
    expect(
      projectIndexSchema.safeParse({ version: 2, projects: [] }).success,
    ).toBe(false);
    expect(
      projectIndexSchema.safeParse({ version: 1, projects: [{ id: "" }] })
        .success,
    ).toBe(false);
  });
});

describe("sorting and searching", () => {
  const list = [
    entry("a", "banana", 5),
    entry("b", "Apple", 9),
    entry("c", "cherry", 1),
  ];
  it("newest edit first, or by name ignoring case", () => {
    expect(sortEntries(list, "recent").map((e) => e.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(sortEntries(list, "name").map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(list.map((e) => e.id)).toEqual(["a", "b", "c"]); // the input is not changed
  });
  it("finds every word in any case; empty search keeps all", () => {
    expect(searchEntries(list, "AN").map((e) => e.id)).toEqual(["a"]);
    expect(searchEntries(list, "  ").length).toBe(3);
    expect(searchEntries(list, "x")).toEqual([]);
  });
});

describe("timeAgo and initials", () => {
  const now = Date.UTC(2026, 10, 17, 12, 0, 0);
  it("says it in plain words", () => {
    expect(timeAgo(now, now - 10_000)).toBe("just now");
    expect(timeAgo(now, now - 60_000)).toBe("1 minute ago");
    expect(timeAgo(now, now - 5 * 60_000)).toBe("5 minutes ago");
    expect(timeAgo(now, now - 3 * 3_600_000)).toBe("3 hours ago");
    expect(timeAgo(now, now - 30 * 3_600_000)).toBe("yesterday");
    expect(timeAgo(now, now - 3 * 86_400_000)).toBe("3 days ago");
    expect(timeAgo(now, now - 30 * 86_400_000)).toContain("2026");
    expect(timeAgo(now, now + 5000)).toBe("just now");
  });
  it("makes tile letters", () => {
    expect(initialsOf("My Game")).toBe("MG");
    expect(initialsOf("town")).toBe("TO");
    expect(initialsOf("  ")).toBe("?");
  });
});
