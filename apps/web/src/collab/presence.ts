import { z } from "zod";
import type { AwarenessLike } from "./editLocks";

/**
 * Who is here and what they are showing: name, colour, selection and 3D cursor, in the awareness record (docs/backend/
 * COLLABORATION.md, section 3). Awareness is never saved and a person's record disappears with their connection.
 * Other people's records come over the network, so everything read from them is checked.
 */

/** The colours people get, one by their client number. Bright enough on the dark 3D view. */
export const PRESENCE_COLORS = [
  "#ff6b6b",
  "#4dabf7",
  "#69db7c",
  "#ffd43b",
  "#da77f2",
  "#ff922b",
  "#38d9a9",
  "#f783ac",
] as const;

export const NAME_MAX_LENGTH = 30;
/** The most selected objects shared with others (a bigger selection shares its first ones). */
export const MAX_SHARED_SELECTION = 100;
/** How far from the middle a shared cursor may be (units). Further is ignored. */
export const MAX_CURSOR_DISTANCE = 10_000;

export function colorForClient(clientId: number): string {
  return PRESENCE_COLORS[clientId % PRESENCE_COLORS.length]!;
}

/** The name a person has until they choose one. */
export function defaultName(clientId: number): string {
  return `Guest ${clientId % 1000}`;
}

/** A name as typed: spaces tidied, at most NAME_MAX_LENGTH characters. null if nothing is left. */
export function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH).trim();
  return name === "" ? null : name;
}

export type Vec3 = [number, number, number];

/** Another person, as shown to this one. */
export type Person = {
  clientId: number;
  name: string;
  color: string;
  selection: string[];
};
export type Cursor = {
  clientId: number;
  name: string;
  color: string;
  position: Vec3;
};

const finite = z
  .number()
  .finite()
  .min(-MAX_CURSOR_DISTANCE)
  .max(MAX_CURSOR_DISTANCE);
const remoteStateSchema = z.object({
  name: z.string().max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  selection: z
    .array(z.string().min(1).max(100))
    .max(MAX_SHARED_SELECTION)
    .optional(),
  cursor: z.tuple([finite, finite, finite]).nullable().optional(),
});

/** Everyone else in the document (not this client), checked, in a steady order. A record that does not pass is skipped. */
export function readPeople(
  states: Map<number, Record<string, unknown>>,
  ownClientId: number,
): { people: Person[]; cursors: Cursor[] } {
  const people: Person[] = [];
  const cursors: Cursor[] = [];
  for (const [clientId, raw] of [...states].sort((a, b) => a[0] - b[0])) {
    if (clientId === ownClientId) continue;
    const parsed = remoteStateSchema.safeParse(raw);
    if (!parsed.success) continue;
    const state = parsed.data;
    const name = cleanName(state.name ?? "") ?? defaultName(clientId);
    const color = state.color ?? colorForClient(clientId);
    people.push({ clientId, name, color, selection: state.selection ?? [] });
    if (state.cursor)
      cursors.push({ clientId, name, color, position: state.cursor });
  }
  return { people, cursors };
}

function samePeople(a: readonly Person[], b: readonly Person[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => {
      const q = b[i]!;
      return (
        p.clientId === q.clientId &&
        p.name === q.name &&
        p.color === q.color &&
        p.selection.length === q.selection.length &&
        p.selection.every((id, k) => id === q.selection[k])
      );
    })
  );
}

/**
 * Publishes this person's name, colour, selection and cursor, and reports everyone else's. `onPeople` is called only when
 * someone's name, colour or selection changed or someone came or went (cursor moves are frequent and would redraw the lists);
 * `onCursors` is called on every change.
 */
export function createPresence(options: {
  awareness: AwarenessLike;
  name: string;
  onPeople: (people: Person[]) => void;
  onCursors: (cursors: Cursor[]) => void;
}) {
  const { awareness } = options;
  let destroyed = false;
  let last: Person[] | null = null;

  awareness.setLocalStateField("name", options.name);
  awareness.setLocalStateField("color", colorForClient(awareness.clientID));
  awareness.setLocalStateField("selection", []);
  awareness.setLocalStateField("cursor", null);

  function update(): void {
    if (destroyed) return;
    const { people, cursors } = readPeople(
      awareness.getStates(),
      awareness.clientID,
    );
    if (!last || !samePeople(last, people)) {
      last = people;
      options.onPeople(people);
    }
    options.onCursors(cursors);
  }
  awareness.on("change", update);
  update();

  return {
    color: colorForClient(awareness.clientID),
    setName(name: string): void {
      awareness.setLocalStateField("name", name);
    },
    setSelection(ids: readonly string[]): void {
      awareness.setLocalStateField(
        "selection",
        ids.slice(0, MAX_SHARED_SELECTION),
      );
    },
    setCursor(position: Vec3 | null): void {
      awareness.setLocalStateField("cursor", position);
    },
    destroy(): void {
      if (destroyed) return;
      awareness.setLocalStateField("selection", []);
      awareness.setLocalStateField("cursor", null);
      awareness.off("change", update);
      destroyed = true;
      options.onPeople([]);
      options.onCursors([]);
    },
  };
}
