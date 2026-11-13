import { create } from "zustand";
import type { SaveStatus } from "@/persistence/autosave";

/** Where saving stands, for the little status text in the top bar. */
export type PersistenceStatus =
  | "loading" // looking for a saved scene
  | SaveStatus // saving, saved, error
  | "unavailable"; // the browser does not allow saving at all

type PersistenceState = {
  status: PersistenceStatus;
  setStatus: (status: PersistenceStatus) => void;
};

export const usePersistenceStore = create<PersistenceState>()((set) => ({
  status: "loading",
  setStatus: (status) => set({ status }),
}));
