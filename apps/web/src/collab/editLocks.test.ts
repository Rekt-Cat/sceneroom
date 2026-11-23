import { describe, expect, it, vi } from "vitest";
import {
  createEditLocks,
  lockMessage,
  type AwarenessLike,
  type EditLock,
} from "./editLocks";

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
    /** Someone else's record arrives or changes. */
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

function setup(clientID = 500) {
  const fake = fakeAwareness(clientID);
  const seen: Record<string, EditLock>[] = [];
  const lost: string[] = [];
  const locks = createEditLocks({
    awareness: fake.awareness,
    name: "Me",
    onLocks: (held) => seen.push(held),
    onLostLock: (mine, holder) => lost.push(`${mine.nodeId}:${holder.name}`),
  });
  return { fake, locks, seen, lost, latest: () => seen.at(-1)! };
}

describe("edit locks", () => {
  it("announces what I am editing, and clears it", () => {
    const { fake, locks } = setup();
    expect(fake.states.get(500)).toMatchObject({ name: "Me", editing: null });
    locks.setEditing({ nodeId: "cube", mode: "paint" });
    expect(fake.states.get(500)).toMatchObject({
      editing: { nodeId: "cube", mode: "paint" },
    });
    locks.setEditing(null);
    expect(fake.states.get(500)).toMatchObject({ editing: null });
  });

  it("shows what other people hold, and drops it when they leave or finish", () => {
    const { fake, latest } = setup();
    fake.remote(7, {
      name: "Alice",
      editing: { nodeId: "cube", mode: "edit" },
    });
    expect(latest()).toEqual({
      cube: { name: "Alice", mode: "edit", clientId: 7 },
    });
    fake.remote(7, { name: "Alice", editing: null });
    expect(latest()).toEqual({});
    fake.remote(8, { name: "Bob", editing: { nodeId: "ball", mode: "bake" } });
    expect(Object.keys(latest())).toEqual(["ball"]);
    fake.gone(8); // the connection closed: the lock is gone by itself
    expect(latest()).toEqual({});
  });

  it("my own record is not a lock for me", () => {
    const { locks, latest } = setup();
    locks.setEditing({ nodeId: "cube", mode: "edit" });
    expect(latest()).toEqual({});
  });

  it("garbage from the network is ignored, a missing name becomes a guest name", () => {
    const { fake, latest } = setup();
    fake.remote(1, "not an object");
    fake.remote(2, { editing: { nodeId: "", mode: "edit" } });
    fake.remote(3, { editing: { nodeId: "x", mode: "fly" } });
    fake.remote(4, {
      name: "x".repeat(500),
      editing: { nodeId: "x", mode: "edit" },
    });
    expect(latest()).toEqual({});
    fake.remote(1234, { editing: { nodeId: "cube", mode: "edit" } });
    expect(latest()["cube"]!.name).toBe("Guest 234");
  });

  it("two people on one object: the lower client number counts", () => {
    const { fake, latest } = setup();
    fake.remote(30, {
      name: "Thirty",
      editing: { nodeId: "cube", mode: "edit" },
    });
    fake.remote(20, {
      name: "Twenty",
      editing: { nodeId: "cube", mode: "paint" },
    });
    expect(latest()["cube"]).toMatchObject({ name: "Twenty", clientId: 20 });
  });

  it("entering at the same moment: the higher number is taken out, the lower one stays", () => {
    // I am 500; Alice is 7 and entered the same object a moment before her record reached me
    const mine = setup(500);
    mine.locks.setEditing({ nodeId: "cube", mode: "edit" });
    mine.fake.remote(7, {
      name: "Alice",
      editing: { nodeId: "cube", mode: "edit" },
    });
    expect(mine.lost).toEqual(["cube:Alice"]);

    // The other way round: I am 5 and Alice is 7: I keep it
    const low = setup(5);
    low.locks.setEditing({ nodeId: "cube", mode: "edit" });
    low.fake.remote(7, {
      name: "Alice",
      editing: { nodeId: "cube", mode: "edit" },
    });
    expect(low.lost).toEqual([]);
  });

  it("destroy clears my record, stops listening and clears the locks", () => {
    const { fake, locks, latest } = setup();
    locks.setEditing({ nodeId: "cube", mode: "edit" });
    locks.destroy();
    expect(fake.states.get(500)).toMatchObject({ editing: null });
    expect(fake.listeners.size).toBe(0);
    expect(latest()).toEqual({});
    const calls = vi.fn();
    locks.setEditing(null); // harmless after destroy
    expect(calls).not.toHaveBeenCalled();
  });
});

describe("lockMessage", () => {
  const locks = {
    cube: { name: "Alice", mode: "paint", clientId: 1 },
  } as const;
  it("says who and what, or nothing when the object is free", () => {
    expect(lockMessage(locks, "cube", "Crate")).toBe(
      'Alice is painting "Crate" right now. Wait until they are done, or work on another object.',
    );
    expect(lockMessage(locks, "other", "Ball")).toBeNull();
  });
});
