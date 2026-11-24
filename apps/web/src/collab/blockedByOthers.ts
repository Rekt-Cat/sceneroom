import { useImportStore } from "@/store/importStore";
import { useCollabStore } from "./collabStore";
import { heldMessage, type Holder } from "./objectHolds";

/**
 * What the scene store asks before it lets someone select or change an object: does someone else hold it (or something
 * inside it, or something it is inside of)? Always "no" when not online, while the connection is down (nobody's holds
 * reach us then) and for a viewer, who is never blocked.
 */
function applies(): boolean {
  const { active, status, readOnly } = useCollabStore.getState();
  return active && status === "online" && !readOnly;
}

export function holderOf(id: string): Holder | undefined {
  return applies() ? useCollabStore.getState().blocked[id] : undefined;
}

export const isBlockedByOthers = (id: string): boolean =>
  holderOf(id) !== undefined;

/** The same refusal is not announced again within this many ms (a drag over a held row would repeat it every frame). */
const SAME_MESSAGE_MS = 1500;
let lastText = "";
let lastAt = 0;

/** Tells the person (in the bar over the 3D view) who has the object. null `id` or a free object says nothing. */
export function tellBlocked(
  id: string,
  name: string,
  now: number = Date.now(),
): void {
  const holder = holderOf(id);
  if (!holder) return;
  const text = heldMessage(holder, name);
  if (text === lastText && now - lastAt < SAME_MESSAGE_MS) return;
  lastText = text;
  lastAt = now;
  useImportStore.getState().setMessage({ tone: "info", text });
}

/** Takes the objects someone else holds out of a selection, and says who has the first of them. */
export function selectableIds(
  ids: string[],
  nameOf: (id: string) => string,
): string[] {
  if (!applies()) return ids;
  const free = ids.filter((id) => !isBlockedByOthers(id));
  if (free.length !== ids.length) {
    const refused = ids.find((id) => isBlockedByOthers(id))!;
    tellBlocked(refused, nameOf(refused));
  }
  return free.length === ids.length ? ids : free;
}

/** For tests: forget the last message, so the next refusal is announced. */
export function forgetLastBlockedMessage(): void {
  lastText = "";
  lastAt = 0;
}
