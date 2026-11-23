import { sha256Hex } from "@/assets/hash";

/** The HTTP address of the collab server's file routes, from its WebSocket address (ws becomes http, wss becomes https). */
export function fileBaseUrl(webSocketUrl: string): string {
  const url = new URL(webSocketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/files";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

/** Talks to the file routes of the collab server (apps/collab-server/src/fileRoutes.ts). */
export type FileClient = {
  /** Is the file on the server? */
  has: (id: string) => Promise<boolean>;
  /** Puts a file on the server (harmless if it is there already). The server checks that the bytes match the id. */
  upload: (id: string, bytes: Uint8Array) => Promise<void>;
  /**
   * Gets a file. null if the server does not have it (yet). The bytes are hashed and must equal the id: the server's
   * answer is never trusted (a wrong answer throws).
   */
  download: (id: string) => Promise<ArrayBuffer | null>;
};

export function createFileClient(options: {
  url: string;
  projectId: string;
  token: string;
  /** For tests. */
  fetchImpl?: typeof fetch;
}): FileClient {
  const base = fileBaseUrl(options.url);
  const call =
    options.fetchImpl ??
    ((...args: Parameters<typeof fetch>) => fetch(...args));
  const address = (id: string) => `${base}/${options.projectId}/${id}`;
  const headers = { Authorization: `Bearer ${options.token}` };

  return {
    async has(id) {
      const response = await call(address(id), { method: "HEAD", headers });
      if (response.status === 404) return false;
      if (!response.ok)
        throw new Error(
          `The server answered ${response.status} when asked about a file`,
        );
      return true;
    },

    async upload(id, bytes) {
      const response = await call(address(id), {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/octet-stream" },
        body: bytes as BodyInit,
      });
      if (!response.ok) {
        throw new Error(
          `The server refused the file: ${response.status} ${await response.text()}`,
        );
      }
    },

    async download(id) {
      const response = await call(address(id), { method: "GET", headers });
      if (response.status === 404) return null;
      if (!response.ok)
        throw new Error(
          `The server answered ${response.status} when sent for a file`,
        );
      const bytes = await response.arrayBuffer();
      if ((await sha256Hex(bytes)) !== id) {
        throw new Error(
          "The file the server sent does not match its id, so it was thrown away",
        );
      }
      return bytes;
    },
  };
}
