import { toNextJsHandler } from "better-auth/next-js";
import { getAccounts } from "@/server/auth";

export const runtime = "nodejs";

const unavailable = () =>
  Response.json(
    { error: "Accounts are not set up on this server." },
    { status: 503 },
  );

/** Everything under /api/auth (sign in, callback, sign out, session) is answered by Better Auth. */
export async function GET(request: Request) {
  const accounts = getAccounts();
  if (!accounts) return unavailable();
  return toNextJsHandler(accounts.auth).GET(request);
}

export async function POST(request: Request) {
  const accounts = getAccounts();
  if (!accounts) return unavailable();
  return toNextJsHandler(accounts.auth).POST(request);
}
