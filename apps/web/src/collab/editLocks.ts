import { z } from "zod";

/** What a person can be doing to one object that nobody else should do to it at the same time. */
export type EditMode = "edit" | "paint" | "bake";

export type EditingState = { nodeId: string; mode: EditMode } | null;

/** Who holds an object, as shown to the others. */
export type EditLock = { name: string; mode: EditMode; clientId: number };

export const EDIT_MODE_VERB: Record<EditMode, string> = {
  edit: "editing the points of",
  paint: "painting",
  bake: "baking",
};

/** The small part of the Yjs awareness object this file uses, so it can be tested without a network. */
export interface AwarenessLike {
  readonly clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: "change", listener: () => void): void;
  off(event: "change", listener: () => void): void;
}

/** What other people's awareness records are allowed to say. They come over the network, so they are checked. */
const remoteStateSchema = z.object({
  name: z.string().max(60).optional(),
  editing: z
    .object({
      nodeId: z.string().min(1).max(100),
      mode: z.enum(["edit", "paint", "bake"]),
    })
    .nullable()
    .optional(),
});

/**
 * The courtesy lock "one editor per object" (docs/backend/COLLABORATION.md, section 7). Entering Edit points, Paint or
 * Bake on an object is announced in your awareness record, which disappears with your connection, so the lock goes
 * away by itself. It is enforced by the editor on everybody's screen, not by the server (the server cannot see what
 * happens inside a file), so it is a courtesy and not a security control.
 *
 * If two people enter at the very same moment, both are let in before the other's record arrives. Then the one with the
 * lower client number keeps the object and the other one is told to leave (`onLostLock`).
 */
export function createEditLocks(options: {
  awareness: AwarenessLike;
  /** The name shown to others. */
  name: string;
  /** Called with the objects others hold, whenever that changes. */
  onLocks: (locks: Record<string, EditLock>) => void;
  /** I entered a mode on an object that someone with a lower client number entered at the same time. */
  onLostLock: (mine: NonNullable<EditingState>, holder: EditLock) => void;
}) {
  const { awareness } = options;
  let mine: EditingState = null;
  let destroyed = false;

  awareness.setLocalStateField("name", options.name);
  awareness.setLocalStateField("editing", null);

  function compute(): Record<string, EditLock> {
    const locks: Record<string, EditLock> = {};
    for (const [clientId, raw] of awareness.getStates()) {
      if (clientId === awareness.clientID) continue;
      const parsed = remoteStateSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.editing) continue;
      const { nodeId, mode } = parsed.data.editing;
      const held = locks[nodeId];
      // Two people on one object: the lower client number counts
      if (held && held.clientId < clientId) continue;
      locks[nodeId] = {
        name: parsed.data.name?.trim() || `Guest ${clientId % 1000}`,
        mode,
        clientId,
      };
    }
    return locks;
  }

  function update(): void {
    if (destroyed) return;
    const locks = compute();
    options.onLocks(locks);
    const holder = mine && locks[mine.nodeId];
    if (mine && holder && holder.clientId < awareness.clientID) {
      options.onLostLock(mine, holder);
    }
  }

  awareness.on("change", update);
  update();

  return {
    /** Tells the others what this person is editing (null = nothing). */
    setEditing(editing: EditingState): void {
      mine = editing;
      awareness.setLocalStateField("editing", editing);
      update();
    },
    destroy(): void {
      if (destroyed) return;
      awareness.setLocalStateField("editing", null);
      awareness.off("change", update);
      destroyed = true;
      options.onLocks({});
    },
  };
}

/** The sentence that says an object is taken, or null if it is free. */
export function lockMessage(
  locks: Readonly<Record<string, EditLock>>,
  nodeId: string,
  nodeName: string,
): string | null {
  const lock = locks[nodeId];
  if (!lock) return null;
  return `${lock.name} is ${EDIT_MODE_VERB[lock.mode]} "${nodeName}" right now. Wait until they are done, or work on another object.`;
}
