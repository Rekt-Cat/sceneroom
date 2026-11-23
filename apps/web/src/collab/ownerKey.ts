const PREFIX = "sceneroom-owner-key:";

/** A new owner key: 32 random bytes as 64 hex characters. Made here, in the browser, and never shown. */
export function makeOwnerKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * The key that makes this browser the owner of a project's sharing (the server keeps only a fingerprint of it, see
 * apps/collab-server/src/ownerStore.ts). Kept in this browser's local storage; without it, links for the project can no
 * longer be made from here. `create` makes one if there is none yet.
 */
export function getOwnerKey(projectId: string, create: boolean): string | null {
  try {
    const stored = window.localStorage.getItem(PREFIX + projectId);
    if (stored && stored.length >= 32) return stored;
    if (!create) return null;
    const key = makeOwnerKey();
    window.localStorage.setItem(PREFIX + projectId, key);
    return key;
  } catch (error) {
    console.warn("Could not use the browser storage for the owner key:", error);
    return null;
  }
}
