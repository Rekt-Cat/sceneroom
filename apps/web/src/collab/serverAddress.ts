/** True for a `ws://` or `wss://` address. */
export function isWebSocketUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "ws:" || protocol === "wss:";
  } catch {
    return false;
  }
}

/** The collab server the Share button uses, from `NEXT_PUBLIC_COLLAB_URL` (see apps/web/.env.example). */
export const DEFAULT_COLLAB_URL = "ws://127.0.0.1:1234";

const OVERRIDE_KEY = "sceneroom-collab-server";

/** The server address this person typed in the Share box, kept in this browser. null = none (the configured one is used). */
export function loadServerOverride(): string | null {
  try {
    const stored = window.localStorage.getItem(OVERRIDE_KEY);
    return stored && isWebSocketUrl(stored) ? stored : null;
  } catch (error) {
    console.warn("Could not read the saved server address:", error);
    return null;
  }
}

export function saveServerOverride(url: string | null): void {
  try {
    if (url === null) window.localStorage.removeItem(OVERRIDE_KEY);
    else window.localStorage.setItem(OVERRIDE_KEY, url);
  } catch (error) {
    console.warn("Could not save the server address:", error);
  }
}

/** The address from `NEXT_PUBLIC_COLLAB_URL`, or the local default. */
export function configuredServerUrl(): string {
  const configured = process.env.NEXT_PUBLIC_COLLAB_URL;
  return configured && isWebSocketUrl(configured)
    ? configured
    : DEFAULT_COLLAB_URL;
}

/** The server the Share box uses: what was typed there, else the configured address. */
export function collabServerUrl(): string {
  return loadServerOverride() ?? configuredServerUrl();
}

/** The HTTP address of a path on the collab server, from its WebSocket address (ws becomes http, wss becomes https). */
export function serverHttpUrl(webSocketUrl: string, path: string): string {
  const url = new URL(webSocketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = path;
  url.search = "";
  url.hash = "";
  return url.toString();
}
