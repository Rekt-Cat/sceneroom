import { cleanName } from "./presence";

const KEY = "sceneroom-presence-name";

/** The name this person chose for showing to others, kept in this browser. null = none chosen (a guest name is used). */
export function loadSavedName(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? null : cleanName(raw);
  } catch (error) {
    // Private windows and blocked storage throw: the name just is not remembered
    console.warn("Could not read the saved name:", error);
    return null;
  }
}

export function saveName(name: string | null): void {
  try {
    if (name === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, name);
  } catch (error) {
    console.warn("Could not save the name:", error);
  }
}
