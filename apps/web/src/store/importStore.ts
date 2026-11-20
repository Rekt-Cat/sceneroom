import { create } from "zustand";

/** A message about an import, shown in a bar over the 3D view until it is dismissed. */
export type ImportMessage = { tone: "error" | "info"; text: string };

/** How long an info message stays before it goes by itself (an error stays until it is dismissed). */
export const INFO_MESSAGE_SECONDS = 8;

type ImportState = {
  /** True while a file is being read and checked. */
  busy: boolean;
  message: ImportMessage | null;
  setBusy: (busy: boolean) => void;
  /** Shows a message. An info message goes by itself after a few seconds; an error stays until dismissed. */
  setMessage: (message: ImportMessage | null) => void;
};

/** The timer of the info message on screen (a newer message starts its own). */
let fade: ReturnType<typeof setTimeout> | null = null;

export const useImportStore = create<ImportState>()((set, get) => ({
  busy: false,
  message: null,
  setBusy: (busy) => set({ busy }),
  setMessage: (message) => {
    if (fade) clearTimeout(fade);
    fade = null;
    set({ message });
    if (message?.tone === "info") {
      fade = setTimeout(() => {
        // Only the message that started this timer goes: something newer stays
        if (get().message === message) set({ message: null });
        fade = null;
      }, INFO_MESSAGE_SECONDS * 1000);
    }
  },
}));
