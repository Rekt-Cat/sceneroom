import { create } from "zustand";
import type { EditLock } from "./editLocks";

/** Where the online connection stands, for the little badge in the top bar. */
export type CollabStatus =
  | "off" // not an online project
  | "connecting" // trying to reach the server
  | "online" // connected, changes are shared
  | "offline" // the connection is lost; work continues here and is merged when it returns
  | "refused"; // the server did not accept the link (wrong or expired)

type CollabState = {
  status: CollabStatus;
  /** True for as long as the editor is bound to a shared document (any status except "off"). */
  active: boolean;
  /** A sentence with more detail, such as why the link was refused. */
  detail: string;
  /** Objects that someone else is editing, painting or baking right now, by object id (see editLocks.ts). */
  locks: Record<string, EditLock>;
  setLocks: (locks: Record<string, EditLock>) => void;
  setStatus: (status: CollabStatus, detail?: string) => void;
};

/**
 * The online state. While `active`, Undo and Redo take back only this person's own changes, field by field, and leave
 * other people's alone (collabHistory.ts, docs/backend/COLLABORATION.md section 8).
 */
export const useCollabStore = create<CollabState>()((set) => ({
  status: "off",
  active: false,
  detail: "",
  locks: {},
  setLocks: (locks) => set({ locks }),
  setStatus: (status, detail = "") =>
    set(
      status === "off"
        ? { status, active: false, detail, locks: {} }
        : { status, active: true, detail },
    ),
}));
