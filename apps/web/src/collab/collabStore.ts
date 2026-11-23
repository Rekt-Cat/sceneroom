import { create } from "zustand";

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
  setStatus: (status: CollabStatus, detail?: string) => void;
};

/**
 * The online state. While `active`, Undo and Redo are switched off: they would put back a whole earlier scene,
 * which would also undo the other people's work. Per-person Undo comes with step M5 (docs/backend/COLLABORATION.md).
 */
export const useCollabStore = create<CollabState>()((set) => ({
  status: "off",
  active: false,
  detail: "",
  setStatus: (status, detail = "") =>
    set({ status, active: status !== "off", detail }),
}));
