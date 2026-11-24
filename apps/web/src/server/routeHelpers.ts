import type { ZodType } from "zod";
import type { Db } from "@sceneroom/db";
import type { AccountsEnv } from "./accountsEnv";
import { getAccounts } from "./auth";
import { MAX_REQUEST_BYTES } from "./limits";
import type { Result } from "./projects";
import { getCurrentUser, type CurrentUser } from "./session";

const json = (body: unknown, status: number) => Response.json(body, { status });

export type RouteContext = { db: Db; user: CurrentUser; env: AccountsEnv };

/**
 * Wraps a route that needs a signed-in person: answers 503 when accounts are not set up, 401 when nobody is signed in,
 * 403 when a browser on another site sends a change (the cookie would be sent along, so the site is checked), and 500
 * with a plain message (details in the server log) when something unexpected goes wrong.
 */
export async function withUser(
  request: Request,
  handler: (context: RouteContext) => Promise<Response>,
): Promise<Response> {
  const accounts = getAccounts();
  if (!accounts)
    return json({ error: "Accounts are not set up on this server." }, 503);
  try {
    const origin = request.headers.get("origin");
    const changes = !["GET", "HEAD"].includes(request.method);
    if (
      changes &&
      origin !== null &&
      origin !== new URL(accounts.env.BETTER_AUTH_URL).origin
    ) {
      return json(
        { error: "Requests from another site are not allowed." },
        403,
      );
    }
    const user = await getCurrentUser();
    if (!user) return json({ error: "Sign in first." }, 401);
    return await handler({ db: accounts.db, user, env: accounts.env });
  } catch (error) {
    console.error(
      `${request.method} ${new URL(request.url).pathname} failed:`,
      error,
    );
    return json({ error: "Something went wrong on the server." }, 500);
  }
}

/** Reads a small JSON body and checks its shape. A bad body is answered here (400, or 413 when too big). */
export async function readBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      response: json({ error: "The request is too big." }, 413),
    };
  }
  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      response: json({ error: "The request is too big." }, 413),
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: json({ error: "The request is not valid JSON." }, 400),
    };
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (i) => `${i.path.join(".") || "body"}: ${i.message}`,
    );
    return {
      ok: false,
      response: json({ error: "The request is not valid.", problems }, 400),
    };
  }
  return { ok: true, data: parsed.data };
}

/** A path value that is not the expected shape is the same as "no such thing". */
export function notFound(): Response {
  return json({ error: "No such project." }, 404);
}

/** A service result as an HTTP answer. */
export function respond<T>(result: Result<T>, successStatus = 200): Response {
  return result.ok
    ? json(result.value, successStatus)
    : json({ error: result.error }, result.status);
}

/**
 * Wraps a route that anyone may call, signed in or not (an invitation preview): 503 when accounts are not set up, and 500
 * with a plain message when something unexpected goes wrong. The route must not depend on who is asking.
 */
export async function withAccounts(
  request: Request,
  handler: (context: { db: Db }) => Promise<Response>,
): Promise<Response> {
  const accounts = getAccounts();
  if (!accounts)
    return json({ error: "Accounts are not set up on this server." }, 503);
  try {
    return await handler({ db: accounts.db });
  } catch (error) {
    console.error(
      `${request.method} ${new URL(request.url).pathname} failed:`,
      error,
    );
    return json({ error: "Something went wrong on the server." }, 500);
  }
}
