import { describe, expect, it } from "vitest";
import type { AwarenessLike } from "./editLocks";
import {
  MAX_SHARED_SELECTION,
  NAME_MAX_LENGTH,
  PRESENCE_COLORS,
  cleanName,
  colorForClient,
  createPresence,
  defaultName,
  readPeople,
  type Cursor,
  type Person,
} from "./presence";

function fakeAwareness(clientID: number) {
  const states = new Map<number, Record<string, unknown>>([[clientID, {}]]);
  const listeners = new Set<() => void>();
  const awareness: AwarenessLike = {
    clientID,
    getStates: () => states,
    setLocalStateField(field, value) {
      states.set(clientID, { ...states.get(clientID), [field]: value });
      listeners.forEach((l) => l());
    },
    on: (_e, l) => void listeners.add(l),
    off: (_e, l) => void listeners.delete(l),
  };
  return {
    awareness,
    states,
    listeners,
    remote(id: number, state: unknown) {
      states.set(id, state as Record<string, unknown>);
      listeners.forEach((l) => l());
    },
  };
}

describe("names and colours", () => {
  it("default names and colours come from the client number", () => {
    expect(defaultName(7)).toBe("Guest 7");
    expect(defaultName(123456)).toBe("Guest 456");
    expect(colorForClient(0)).toBe(PRESENCE_COLORS[0]);
    expect(colorForClient(PRESENCE_COLORS.length + 2)).toBe(PRESENCE_COLORS[2]);
  });

  it("a typed name is tidied and limited, and empty means none", () => {
    expect(cleanName("  Ayush   D  ")).toBe("Ayush D");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("x".repeat(100))).toHaveLength(NAME_MAX_LENGTH);
  });
});

describe("readPeople", () => {
  it("lists everyone else in order, with names, colours, selections and cursors", () => {
    const states = new Map<number, Record<string, unknown>>([
      [
        9,
        {
          name: "Zed",
          color: "#112233",
          selection: ["a", "b"],
          cursor: [1, 2, 3],
        },
      ],
      [3, { name: "Amy", color: "#445566", selection: [], cursor: null }],
      [1, { name: "Me" }],
    ]);
    const { people, cursors } = readPeople(states, 1);
    expect(people.map((p) => p.name)).toEqual(["Amy", "Zed"]);
    expect(people[1]).toEqual({
      clientId: 9,
      name: "Zed",
      color: "#112233",
      selection: ["a", "b"],
    });
    expect(cursors).toEqual([
      { clientId: 9, name: "Zed", color: "#112233", position: [1, 2, 3] },
    ]);
  });

  it("fills in a guest name and colour when a record has none", () => {
    const { people } = readPeople(new Map([[1234, {}]]), 1);
    expect(people[0]).toMatchObject({
      name: "Guest 234",
      color: colorForClient(1234),
    });
  });

  it("skips records that are not valid, and ignores cursors far away or not numbers", () => {
    const states = new Map<number, Record<string, unknown>>([
      [2, "garbage" as unknown as Record<string, unknown>],
      [3, { color: "red" }],
      [4, { selection: [1, 2] }],
      [
        5,
        {
          selection: Array.from(
            { length: MAX_SHARED_SELECTION + 1 },
            (_, i) => `n${i}`,
          ),
        },
      ],
      [6, { cursor: [1e9, 0, 0] }],
      [7, { cursor: ["a", 0, 0] }],
      [8, { name: "Ok", cursor: [0, 0, 0] }],
    ]);
    const { people, cursors } = readPeople(states, 1);
    expect(people.map((p) => p.clientId)).toEqual([8]);
    expect(cursors).toHaveLength(1);
  });
});

describe("createPresence", () => {
  function setup(id = 5) {
    const fake = fakeAwareness(id);
    const people: Person[][] = [];
    const cursors: Cursor[][] = [];
    const presence = createPresence({
      awareness: fake.awareness,
      name: "Me",
      onPeople: (p) => people.push(p),
      onCursors: (c) => cursors.push(c),
    });
    return { fake, presence, people, cursors };
  }

  it("publishes name, colour, selection and cursor", () => {
    const { fake, presence } = setup();
    expect(fake.states.get(5)).toMatchObject({
      name: "Me",
      color: colorForClient(5),
      selection: [],
      cursor: null,
    });
    presence.setName("Renamed");
    presence.setSelection(["a", "b"]);
    presence.setCursor([1, 0, 2]);
    expect(fake.states.get(5)).toMatchObject({
      name: "Renamed",
      selection: ["a", "b"],
      cursor: [1, 0, 2],
    });
  });

  it("shares at most the first MAX_SHARED_SELECTION objects", () => {
    const { fake, presence } = setup();
    presence.setSelection(Array.from({ length: 500 }, (_, i) => `n${i}`));
    expect((fake.states.get(5)!["selection"] as string[]).length).toBe(
      MAX_SHARED_SELECTION,
    );
  });

  it("reports others, but a cursor that only moved does not report the people again", () => {
    const { fake, people, cursors } = setup();
    fake.remote(8, {
      name: "Bob",
      color: "#abcdef",
      selection: [],
      cursor: [0, 0, 0],
    });
    const peopleCalls = people.length;
    fake.remote(8, {
      name: "Bob",
      color: "#abcdef",
      selection: [],
      cursor: [5, 0, 0],
    });
    expect(people.length).toBe(peopleCalls); // the list did not change
    expect(cursors.at(-1)![0]!.position).toEqual([5, 0, 0]);
    fake.remote(8, {
      name: "Bob",
      color: "#abcdef",
      selection: ["x"],
      cursor: [5, 0, 0],
    });
    expect(people.length).toBe(peopleCalls + 1); // a selection did
    expect(people.at(-1)![0]!.selection).toEqual(["x"]);
  });

  it("destroy clears my selection and cursor, stops listening and empties the lists", () => {
    const { fake, presence, people, cursors } = setup();
    fake.remote(8, { name: "Bob" });
    presence.setSelection(["a"]);
    presence.destroy();
    expect(fake.states.get(5)).toMatchObject({ selection: [], cursor: null });
    expect(fake.listeners.size).toBe(0);
    expect(people.at(-1)).toEqual([]);
    expect(cursors.at(-1)).toEqual([]);
  });
});
