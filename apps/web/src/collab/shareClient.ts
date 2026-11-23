import { z } from "zod";
import { serverHttpUrl } from "./serverAddress";

export type LinkRole = "editor" | "viewer";

/** How long a link works, in days. undefined = until the links are cancelled. */
export type LinkExpiry = number | undefined;

const tokenResponse = z.object({ token: z.string().min(1).max(2000) });
const resetResponse = z.object({ generation: z.number().int().min(0) });

/** Talks to the sharing routes of the collab server (apps/collab-server/src/shareRoutes.ts), as the owner of a project. */
export type ShareClient = {
  /** Makes a link token. The first person to do this for a project becomes its owner. */
  makeLink: (role: LinkRole, expiresInDays?: LinkExpiry) => Promise<string>;
  /** Cancels every link made so far and disconnects everybody. */
  cancelAllLinks: () => Promise<void>;
};

/** What went wrong, in words for the person. */
export class ShareError extends Error {}

export function createShareClient(options: {
  url: string;
  projectId: string;
  ownerKey: string;
  fetchImpl?: typeof fetch;
}): ShareClient {
  const call =
    options.fetchImpl ??
    ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function post(path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await call(serverHttpUrl(options.url, path), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.ownerKey}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      console.warn("The collab server could not be reached:", error);
      throw new ShareError(
        `Could not reach the collab server at ${options.url}. Is it running?`,
      );
    }
    if (response.status === 403) {
      throw new ShareError(
        "This browser did not start sharing this project, so it cannot make links for it. Ask the person who did.",
      );
    }
    if (response.status === 404) {
      throw new ShareError("Nothing is shared for this project yet.");
    }
    if (!response.ok) {
      throw new ShareError(`The collab server answered ${response.status}.`);
    }
    return response.json();
  }

  return {
    async makeLink(role, expiresInDays) {
      const body = await post(`/share/${options.projectId}`, {
        role,
        ...(expiresInDays ? { expiresInDays } : {}),
      });
      const parsed = tokenResponse.safeParse(body);
      if (!parsed.success)
        throw new ShareError(
          "The collab server sent an answer that was not understood.",
        );
      return parsed.data.token;
    },
    async cancelAllLinks() {
      const body = await post(`/share/${options.projectId}/reset`);
      if (!resetResponse.safeParse(body).success) {
        throw new ShareError(
          "The collab server sent an answer that was not understood.",
        );
      }
    },
  };
}
