import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { createDb, type Db } from "@sceneroom/db";
import { readAccountsEnv, type AccountsEnv } from "./accountsEnv";

/** Builds the sign-in system (Better Auth) on top of the accounts database. Sign-in is GitHub only. */
export function createAuth(env: AccountsEnv, db: Db) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: prismaAdapter(db, { provider: "postgresql" }),
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    },
    // Must be last: lets server code (route handlers, server actions) set the session cookie
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

type Accounts = { auth: Auth; db: Db; env: AccountsEnv };
const cache = globalThis as unknown as { sceneroomAccounts?: Accounts };

/**
 * The accounts system, made on first use and reused (also across dev-server reloads, so the database connections do not
 * pile up). null = accounts are not set up on this machine; the editor then works as before.
 */
export function getAccounts(): Accounts | null {
  if (cache.sceneroomAccounts) return cache.sceneroomAccounts;
  const result = readAccountsEnv(process.env);
  if (!result.ok) return null;
  const db = createDb(result.env.DATABASE_URL);
  cache.sceneroomAccounts = {
    auth: createAuth(result.env, db),
    db,
    env: result.env,
  };
  return cache.sceneroomAccounts;
}
