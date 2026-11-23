import { startCollab } from "./startCollab";

/**
 * Holds the one online connection of the open project, so the editor page and the Share dialog can start and stop it
 * without knowing about each other.
 */
let stopCurrent: (() => void) | null = null;

/** Goes online with the project (replacing any connection there is). */
export function connectCollab(options: {
  projectId: string;
  url: string;
  token: string;
}): void {
  stopCurrent?.();
  stopCurrent = startCollab(options);
}

/** Goes offline again. */
export function disconnectCollab(): void {
  stopCurrent?.();
  stopCurrent = null;
}
