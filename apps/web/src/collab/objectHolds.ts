import { z } from "zod";
import type { AwarenessLike } from "./editLocks";
import {
  MAX_SHARED_SELECTION,
  cleanName,
  colorForClient,
  defaultName,
} from "./presence";

/**
 * Selection locks (docs/backend/COLLABORATION.md, "selection locks"). Selecting an object holds it: nobody else can select
 * or change it, or anything inside it or containing it, until it is released. A hold is announced in the holder's
 * awareness record (`holding`, the ids), which disappears with their connection. It is enforced by every editor on its own
 * screen, not by the server: a courtesy, with the merge rule of the shared document as the safety net.
 */

/** A hold ends this long after the holder's last activity (ms). */
export const HOLD_IDLE_MS = 30_000;

/** Who holds an object, as shown to the others. */
export type Holder = { clientId: number; name: string; color: string };

/** The objects of the scene and where each hangs (only the parent matters here). */
export type NodeTree = Readonly<Record<string, { parentId: string | null }>>;

/**
 * Every object a hold on `id` reaches: the object itself, everything inside it, and everything it is inside of (moving or
 * deleting a parent would move or delete the held object). Unknown ids reach nothing.
 */
export function reachOf(id: string, tree: NodeTree): Set<string> {
  const reached = new Set<string>();
  if (!tree[id]) return reached;
  reached.add(id);
  // Up: the parents
  let parent = tree[id]!.parentId;
  while (parent !== null && tree[parent] && !reached.has(parent)) {
    reached.add(parent);
    parent = tree[parent]!.parentId;
  }
  // Down: everything whose chain of parents passes through `id`
  for (const other of Object.keys(tree)) {
    if (reached.has(other)) continue;
    const chain: string[] = [];
    let current: string | null = other;
    let inside = false;
    while (current !== null && tree[current] && !chain.includes(current)) {
      if (current === id) {
        inside = true;
        break;
      }
      chain.push(current);
      current = tree[current]!.parentId;
    }
    if (inside) for (const member of chain) reached.add(member);
  }
  return reached;
}

/** What other people's awareness records are allowed to say here. They come over the network, so they are checked. */
const remoteStateSchema = z.object({
  name: z.string().max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  holding: z
    .array(z.string().min(1).max(100))
    .max(MAX_SHARED_SELECTION)
    .optional(),
});

export type RemoteHold = { holder: Holder; ids: string[] };

/** Everyone else's holds, checked, in a steady order (lowest client number first). A record that does not pass is skipped. */
export function readRemoteHolds(
  states: Map<number, Record<string, unknown>>,
  ownClientId: number,
): RemoteHold[] {
  const holds: RemoteHold[] = [];
  for (const [clientId, raw] of [...states].sort((a, b) => a[0] - b[0])) {
    if (clientId === ownClientId) continue;
    const parsed = remoteStateSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.holding?.length) continue;
    holds.push({
      holder: {
        clientId,
        name: cleanName(parsed.data.name ?? "") ?? defaultName(clientId),
        color: parsed.data.color ?? colorForClient(clientId),
      },
      ids: parsed.data.holding,
    });
  }
  return holds;
}

export type HoldState = {
  /** The objects someone else holds directly, with who. */
  holds: Record<string, Holder>;
  /** Everything that is out of bounds because of those holds (the held objects, what is inside them and what contains them). */
  blocked: Record<string, Holder>;
  /** My own held objects that someone with a lower client number claimed at the same moment: I must let go. */
  lost: { ids: string[]; holder: Holder } | null;
};

/**
 * Works out what everybody else's holds mean for me. If a hold reaches something I hold too, the one with the lower client
 * number keeps it: when that is me, their hold is ignored (they let go on their side); when it is them, I lose my
 * conflicting objects.
 */
export function computeHolds(
  remote: readonly RemoteHold[],
  mine: readonly string[],
  ownClientId: number,
  tree: NodeTree,
): HoldState {
  const holds: Record<string, Holder> = {};
  const blocked: Record<string, Holder> = {};
  let lost: HoldState["lost"] = null;
  for (const { holder, ids } of remote) {
    const reach = new Set<string>();
    for (const id of ids) {
      if (!tree[id]) continue;
      for (const reached of reachOf(id, tree)) reach.add(reached);
    }
    if (reach.size === 0) continue;
    const conflicting = mine.filter((id) => reach.has(id));
    if (conflicting.length > 0) {
      if (ownClientId < holder.clientId) continue;
      lost ??= { ids: [], holder };
      for (const id of conflicting)
        if (!lost.ids.includes(id)) lost.ids.push(id);
    }
    for (const id of ids) if (tree[id] && !(id in holds)) holds[id] = holder;
    for (const id of reach) if (!(id in blocked)) blocked[id] = holder;
  }
  return { holds, blocked, lost };
}

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};
const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Holds objects for this person: publishes their selection as `holding`, works out what the others' holds block, and lets go
 * after `idleMs` without activity. It knows nothing about the store or the screen: everything goes through the options.
 */
export function createObjectHolds(options: {
  awareness: AwarenessLike;
  getTree: () => NodeTree;
  getSelection: () => readonly string[];
  setSelection: (ids: string[]) => void;
  /** A viewer holds nothing and is never blocked. */
  isReadOnly: () => boolean;
  /** The result of the last calculation, for the screen. */
  onState: (state: Pick<HoldState, "holds" | "blocked">) => void;
  /** Objects I was taken off because someone else claimed them at the same moment. */
  onLost: (ids: string[], holder: Holder) => void;
  /** My hold ended because of no activity. */
  onIdle: (ids: string[]) => void;
  idleMs?: number;
  timers?: Timers;
}) {
  const { awareness } = options;
  const idleMs = options.idleMs ?? HOLD_IDLE_MS;
  const timers = options.timers ?? realTimers;
  let destroyed = false;
  let connected = true;
  let timer: unknown = null;
  let working = false;
  let treeSnapshot: Map<string, string | null> | null = null;

  const held = (): string[] => {
    if (options.isReadOnly()) return [];
    const tree = options.getTree();
    return options
      .getSelection()
      .filter((id) => tree[id] !== undefined)
      .slice(0, MAX_SHARED_SELECTION);
  };

  const publish = (ids: string[]) =>
    awareness.setLocalStateField("holding", ids);

  function clearTimer() {
    if (timer !== null) timers.clear(timer);
    timer = null;
  }

  function restartTimer() {
    clearTimer();
    if (destroyed || held().length === 0) return;
    timer = timers.set(() => {
      timer = null;
      const ids = held();
      if (ids.length === 0) return;
      options.setSelection([]);
      publish([]);
      options.onIdle(ids);
      recompute();
    }, idleMs);
  }

  function recompute() {
    if (destroyed || working) return;
    if (!connected || options.isReadOnly()) {
      options.onState({ holds: {}, blocked: {} });
      return;
    }
    working = true;
    try {
      const result = computeHolds(
        readRemoteHolds(awareness.getStates(), awareness.clientID),
        held(),
        awareness.clientID,
        options.getTree(),
      );
      options.onState({ holds: result.holds, blocked: result.blocked });
      if (result.lost) {
        const gone = new Set(result.lost.ids);
        options.setSelection(
          options.getSelection().filter((id) => !gone.has(id)),
        );
        publish(held());
        options.onLost(result.lost.ids, result.lost.holder);
      }
    } finally {
      working = false;
    }
  }

  const onAwarenessChange = () => recompute();
  awareness.on("change", onAwarenessChange);
  publish(held());
  recompute();
  restartTimer();

  return {
    /** The selection changed: announce it, start the idle clock, and check it against the others' holds. */
    selectionChanged(): void {
      if (destroyed) return;
      publish(held());
      restartTimer();
      recompute();
    },
    /** The person did something (a key, a mouse button): the idle clock starts again. */
    activity(): void {
      if (destroyed || timer === null) return;
      restartTimer();
    },
    /** The scene changed: only a change of who is inside whom matters here. */
    treeChanged(): void {
      if (destroyed) return;
      const tree = options.getTree();
      const ids = Object.keys(tree);
      const same =
        treeSnapshot !== null &&
        treeSnapshot.size === ids.length &&
        ids.every((id) => treeSnapshot!.get(id) === tree[id]!.parentId);
      if (same) return;
      treeSnapshot = new Map(ids.map((id) => [id, tree[id]!.parentId]));
      recompute();
    },
    /** Without a connection to the collab server there are no holds (nobody's records arrive). */
    setConnected(value: boolean): void {
      if (destroyed || connected === value) return;
      connected = value;
      recompute();
    },
    destroy(): void {
      if (destroyed) return;
      clearTimer();
      awareness.off("change", onAwarenessChange);
      awareness.setLocalStateField("holding", []);
      destroyed = true;
      options.onState({ holds: {}, blocked: {} });
    },
  };
}

/** The sentence for someone who tried to take an object that is held. */
export function heldMessage(holder: Holder, objectName: string): string {
  return `${holder.name} is working on "${objectName}" right now. Try again when they are done.`;
}
