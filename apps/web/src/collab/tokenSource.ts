import { z } from "zod";

/**
 * Where the editor gets the token it shows the collab server.
 *
 * - `fresh()` is used at every (re)connect of the live connection, so a removed member or a changed role takes effect at
 *   the next connect.
 * - `cached()` is used for the file requests (many, one after another): it reuses a token until shortly before it runs out.
 *
 * A link token (a string made by the Share button) is the same every time; an account token is fetched from the web app.
 */
export type TokenSource = {
  fresh: () => Promise<string>;
  cached: () => Promise<string>;
};

export function fixedToken(token: string): TokenSource {
  const get = async () => token;
  return { fresh: get, cached: get };
}

/** A token or a source of tokens, as the connection code accepts them. */
export function asTokenSource(token: string | TokenSource): TokenSource {
  return typeof token === "string" ? fixedToken(token) : token;
}

const answerSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

/** How long before it runs out a cached token is replaced (seconds). */
export const REFRESH_MARGIN_SECONDS = 60;

/** Says what went wrong in words the person can act on. */
function problemFor(status: number): string {
  if (status === 401) return "You are signed out. Sign in again to go online.";
  if (status === 404) return "You are not a member of this project.";
  if (status === 503) return "Accounts are not set up on this server.";
  return `The server could not give a token (${status}).`;
}

/** Gets tokens for a project from the web app (`POST /api/projects/<id>/token`, which checks that you are a member). */
export function createAccountTokenSource(
  projectId: string,
  options: {
    /** For tests. */
    fetchImpl?: typeof fetch;
    nowSeconds?: () => number;
  } = {},
): TokenSource {
  const call =
    options.fetchImpl ??
    ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  let kept: { token: string; expiresAt: number } | null = null;

  async function request(): Promise<string> {
    const response = await call(`/api/projects/${projectId}/token`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(problemFor(response.status));
    const parsed = answerSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new Error("The server's token answer was not understood.");
    kept = parsed.data;
    return parsed.data.token;
  }

  return {
    fresh: request,
    async cached() {
      if (kept && kept.expiresAt - REFRESH_MARGIN_SECONDS > now()) {
        return kept.token;
      }
      return request();
    },
  };
}
