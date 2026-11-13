import { create } from "zustand";

/** A message about an import, shown in a bar over the 3D view until it is dismissed. */
export type ImportMessage = { tone: "error" | "info"; text: string };

type ImportState = {
  /** True while a file is being read and checked. */
  busy: boolean;
  message: ImportMessage | null;
  setBusy: (busy: boolean) => void;
  setMessage: (message: ImportMessage | null) => void;
};

export const useImportStore = create<ImportState>()((set) => ({
  busy: false,
  message: null,
  setBusy: (busy) => set({ busy }),
  setMessage: (message) => set({ message }),
}));
