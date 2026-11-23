import type { Vec3 } from "./presence";

/** What the 3D view needs from the running presence: to tell the others where this person's pointer is. */
export type CursorSender = (position: Vec3 | null) => void;

let sender: CursorSender | null = null;

export function setCursorSender(next: CursorSender | null): void {
  sender = next;
}

/** Tells the others where the pointer is in the scene (null = it left the view). Does nothing when not online. */
export function sendCursor(position: Vec3 | null): void {
  sender?.(position);
}
