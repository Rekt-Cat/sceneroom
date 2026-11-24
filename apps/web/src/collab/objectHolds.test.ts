import { describe, expect, it } from "vitest";
import {
  HOLD_IDLE_MS,
  computeHolds,
  createObjectHolds,
  heldMessage,
  readRemoteHolds,
  reachOf,
  type HoldState,
  type NodeTree,
} from "./objectHolds";
import type { AwarenessLike } from "./editLocks";

// house (roof, door), tree (leaves), lamp
const tree: NodeTree = {
  house: { parentId: null },
  roof: { parentId: "house" },
  door: { parentId: "house" },
  tree: { parentId: null },
  leaves: { parentId: "tree" },
  lamp: { parentId: null },
};
const sorted = (set: Set<string>) => [...set].sort();

describe("what a hold reaches", () => {
  it("the object, everything inside it and everything it is inside of", () => {
    expect(sorted(reachOf("house", tree))).toEqual(["door", "house", "roof"]);
    expect(sorted(reachOf("roof", tree))).toEqual(["house", "roof"]);
    expect(sorted(reachOf("leaves", tree))).toEqual(["leaves", "tree"]);
    expect(sorted(reachOf("lamp", tree))).toEqual(["lamp"]);
  });

  it("reaches deep: a grandchild and a grandparent", () => {
    const deep: NodeTree = {
      a: { parentId: null },
      b: { parentId: "a" },
      c: { parentId: "b" },
    };
    expect(sorted(reachOf("a", deep))).toEqual(["a", "b", "c"]);
    expect(sorted(reachOf("c", deep))).toEqual(["a", "b", "c"]);
    expect(sorted(reachOf("b", deep))).toEqual(["a", "b", "c"]);
  });

  it("an unknown id reaches nothing, and a broken tree (a loop) does not hang", () => {
    expect(reachOf("ghost", tree).size).toBe(0);
    const loop: NodeTree = { x: { parentId: "y" }, y: { parentId: "x" } };
    expect(sorted(reachOf("x", loop))).toEqual(["x", "y"]);
  });
});

const person = (clientId: number, holding: string[], extra: object = {}) => ({
  holder: { clientId, name: `P${clientId}`, color: "#ff6b6b" },
  ids: holding,
  ...extra,
});

describe("what other people's holds mean for me", () => {
  it("their held object and everything it reaches is blocked, with who holds it", () => {
    const state = computeHolds([person(7, ["house"])], [], 100, tree);
    expect(Object.keys(state.holds)).toEqual(["house"]);
    expect(Object.keys(state.blocked).sort()).toEqual([
      "door",
      "house",
      "roof",
    ]);
    expect(state.blocked["roof"]!.name).toBe("P7");
    expect(state.lost).toBeNull();
    expect(state.blocked["tree"]).toBeUndefined();
  });

  it("a hold on a child blocks the parent too (moving the parent would move it)", () => {
    const state = computeHolds([person(7, ["roof"])], [], 100, tree);
    expect(Object.keys(state.blocked).sort()).toEqual(["house", "roof"]);
    expect(Object.keys(state.holds)).toEqual(["roof"]);
  });

  it("holds on things that are not in the scene are ignored", () => {
    const state = computeHolds([person(7, ["ghost"])], [], 100, tree);
    expect(state.blocked).toEqual({});
  });

  it("at the same moment the lower client number keeps the object", () => {
    // I hold the house too; they have the lower number: I lose it
    const lose = computeHolds([person(7, ["house"])], ["house"], 100, tree);
    expect(lose.lost).toEqual({ ids: ["house"], holder: person(7, []).holder });
    expect(lose.blocked["house"]!.clientId).toBe(7);
    // I have the lower number: their hold is ignored, I keep mine
    const keep = computeHolds([person(300, ["house"])], ["house"], 100, tree);
    expect(keep.lost).toBeNull();
    expect(keep.holds).toEqual({});
    expect(keep.blocked).toEqual({});
  });

  it("a clash through the hierarchy counts too (they hold the roof, I hold the house)", () => {
    expect(
      computeHolds([person(7, ["roof"])], ["house"], 100, tree).lost?.ids,
    ).toEqual(["house"]);
    expect(
      computeHolds([person(300, ["roof"])], ["house"], 100, tree).lost,
    ).toBeNull();
  });

  it("I lose only what clashes; the rest of my selection stays", () => {
    const state = computeHolds(
      [person(7, ["house"])],
      ["door", "lamp"],
      100,
      tree,
    );
    expect(state.lost?.ids).toEqual(["door"]);
  });

  it("when two other people hold the same object the lower number is shown", () => {
    const state = computeHolds(
      [person(5, ["lamp"]), person(9, ["lamp"])],
      [],
      100,
      tree,
    );
    expect(state.holds["lamp"]!.clientId).toBe(5);
  });
});

describe("reading other people's records", () => {
  it("checks them: a bad record is skipped, a missing name gets a guest name, my own record is left out", () => {
    const states = new Map<number, Record<string, unknown>>([
      [100, { holding: ["house"] }],
      [7, { name: "Ada", color: "#112233", holding: ["house", "lamp"] }],
      [8, { holding: "not a list" }],
      [9, { holding: [""] }],
      [10, { holding: [] }],
      [11, { color: "red", holding: ["tree"] }],
      [12, { holding: ["x".repeat(101)] }],
      [13, { holding: Array.from({ length: 101 }, (_, i) => `o${i}`) }],
    ]);
    const read = readRemoteHolds(states, 100);
    expect(read.map((r) => r.holder.clientId)).toEqual([7]);
    expect(read[0]).toEqual({
      holder: { clientId: 7, name: "Ada", color: "#112233" },
      ids: ["house", "lamp"],
    });
    const guest = readRemoteHolds(new Map([[2345, { holding: ["a"] }]]), 100);
    expect(guest[0]!.holder.name).toBe("Guest 345");
  });
});

/** A fake awareness: other people's records can be set, and listeners are told. */
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
    on: (_event, listener) => void listeners.add(listener),
    off: (_event, listener) => void listeners.delete(listener),
  };
  return {
    awareness,
    states,
    remote(id: number, state: unknown) {
      states.set(id, state as Record<string, unknown>);
      listeners.forEach((l) => l());
    },
    gone(id: number) {
      states.delete(id);
      listeners.forEach((l) => l());
    },
    listeners,
  };
}

/** Timers the test moves by hand. */
function fakeTimers() {
  let now = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  let next = 1;
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        const handle = next++;
        pending.set(handle, { at: now + ms, fn });
        return handle;
      },
      clear: (handle: unknown) => void pending.delete(handle as number),
    },
    advance(ms: number) {
      now += ms;
      for (const [handle, item] of [...pending]) {
        if (item.at <= now) {
          pending.delete(handle);
          item.fn();
        }
      }
    },
    count: () => pending.size,
  };
}

function setup(clientID = 100, readOnly = false) {
  const fake = fakeAwareness(clientID);
  const clock = fakeTimers();
  let selection: string[] = [];
  let ro = readOnly;
  const states: Pick<HoldState, "holds" | "blocked">[] = [];
  const lost: string[] = [];
  const idle: string[][] = [];
  const keeper = createObjectHolds({
    awareness: fake.awareness,
    getTree: () => tree,
    getSelection: () => selection,
    setSelection: (ids) => {
      selection = ids;
      keeper.selectionChanged();
    },
    isReadOnly: () => ro,
    onState: (state) => states.push(state),
    onLost: (ids, holder) => lost.push(`${ids.join(",")}:${holder.name}`),
    onIdle: (ids) => idle.push(ids),
    timers: clock.timers,
  });
  return {
    fake,
    clock,
    keeper,
    select: (ids: string[]) => {
      selection = ids;
      keeper.selectionChanged();
    },
    selection: () => selection,
    latest: () => states.at(-1)!,
    lost,
    idle,
    setReadOnly: (value: boolean) => {
      ro = value;
      keeper.selectionChanged();
    },
  };
}

const holding = (fake: ReturnType<typeof fakeAwareness>, id = 100) =>
  (fake.states.get(id) as { holding: string[] }).holding;

describe("the hold keeper", () => {
  it("announces what I have selected, and nothing once it is deselected", () => {
    const t = setup();
    expect(holding(t.fake)).toEqual([]);
    t.select(["house", "lamp"]);
    expect(holding(t.fake)).toEqual(["house", "lamp"]);
    t.select([]);
    expect(holding(t.fake)).toEqual([]);
  });

  it("announces only objects that exist, and no more than the limit", () => {
    const t = setup();
    t.select(["house", "ghost"]);
    expect(holding(t.fake)).toEqual(["house"]);
  });

  it("shows the others' holds as blocked, and clears them when they leave", () => {
    const t = setup();
    t.fake.remote(7, { name: "Ada", holding: ["house"] });
    expect(Object.keys(t.latest().blocked).sort()).toEqual([
      "door",
      "house",
      "roof",
    ]);
    expect(t.latest().holds["house"]!.name).toBe("Ada");
    t.fake.gone(7);
    expect(t.latest().blocked).toEqual({});
  });

  it("lets go after 30 seconds without activity: deselects, tells, and announces nothing", () => {
    const t = setup();
    t.select(["house"]);
    t.clock.advance(HOLD_IDLE_MS - 1);
    expect(t.selection()).toEqual(["house"]);
    t.clock.advance(1);
    expect(t.selection()).toEqual([]);
    expect(t.idle).toEqual([["house"]]);
    expect(holding(t.fake)).toEqual([]);
    expect(t.clock.count()).toBe(0);
  });

  it("activity starts the 30 seconds again; selecting something else does too", () => {
    const t = setup();
    t.select(["house"]);
    t.clock.advance(20_000);
    t.keeper.activity();
    t.clock.advance(20_000);
    expect(t.selection()).toEqual(["house"]);
    t.select(["lamp"]);
    t.clock.advance(29_000);
    expect(t.selection()).toEqual(["lamp"]);
    t.clock.advance(1_000);
    expect(t.selection()).toEqual([]);
  });

  it("activity with nothing selected starts no clock", () => {
    const t = setup();
    t.keeper.activity();
    expect(t.clock.count()).toBe(0);
    t.select(["house"]);
    t.select([]);
    expect(t.clock.count()).toBe(0);
  });

  it("two people select the same object at the same moment: the lower number keeps it, the other is taken off it", () => {
    // I am 100; they are 7 (lower): their record arrives after I selected
    const t = setup(100);
    t.select(["house", "lamp"]);
    t.fake.remote(7, { name: "Ada", holding: ["house"] });
    expect(t.selection()).toEqual(["lamp"]);
    expect(t.lost).toEqual(["house:Ada"]);
    expect(holding(t.fake)).toEqual(["lamp"]);
    // I am 5 (lower): I keep it and their hold is ignored
    const u = setup(5);
    u.select(["house"]);
    u.fake.remote(7, { name: "Bo", holding: ["house"] });
    expect(u.selection()).toEqual(["house"]);
    expect(u.lost).toEqual([]);
    expect(u.latest().blocked).toEqual({});
  });

  it("a viewer holds nothing and is never blocked; promoted to editor they start holding", () => {
    const t = setup(100, true);
    t.select(["house"]);
    expect(holding(t.fake)).toEqual([]);
    t.fake.remote(7, { holding: ["house"] });
    expect(t.latest()).toEqual({ holds: {}, blocked: {} });
    expect(t.selection()).toEqual(["house"]);
    t.select(["lamp"]);
    t.setReadOnly(false);
    expect(holding(t.fake)).toEqual(["lamp"]);
    // ... and as an editor, the house someone else holds is not theirs to keep
    t.select(["house"]);
    expect(t.selection()).toEqual([]);
  });

  it("without a connection there are no holds; they come back with it", () => {
    const t = setup();
    t.fake.remote(7, { holding: ["house"] });
    expect(Object.keys(t.latest().blocked)).toContain("house");
    t.keeper.setConnected(false);
    expect(t.latest()).toEqual({ holds: {}, blocked: {} });
    t.keeper.setConnected(true);
    expect(Object.keys(t.latest().blocked)).toContain("house");
  });

  it("is told when the scene's tree changes, not when nothing moved", () => {
    const t = setup();
    t.keeper.treeChanged();
    const before = t.latest();
    t.keeper.treeChanged();
    expect(t.latest()).toBe(before);
  });

  it("destroy releases everything: the announcement, the clock and the listener", () => {
    const t = setup();
    t.select(["house"]);
    t.keeper.destroy();
    expect(holding(t.fake)).toEqual([]);
    expect(t.clock.count()).toBe(0);
    expect(t.fake.listeners.size).toBe(0);
    expect(t.latest()).toEqual({ holds: {}, blocked: {} });
    t.keeper.selectionChanged();
    t.keeper.activity();
  });
});

describe("the message", () => {
  it("names who has the object", () => {
    expect(
      heldMessage({ clientId: 1, name: "Ada", color: "#fff" }, "House"),
    ).toBe(
      'Ada is working on "House" right now. Try again when they are done.',
    );
  });
});
