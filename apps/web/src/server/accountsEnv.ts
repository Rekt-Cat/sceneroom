import { z } from "zod";

/** The settings accounts need (apps/web/.env.example). All of them are required together; none = accounts are off. */
const accountsEnvSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  COLLAB_SECRET: z.string().min(32, "must be at least 32 characters"),
  /**
   * The HTTP address of the collab server (for example http://127.0.0.1:1234), used to tell it to disconnect someone who was
   * removed. Optional: without it a removed person is cut off at their next connect (within an hour) instead of at once.
   */
  COLLAB_ADMIN_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
});

export type AccountsEnv = z.infer<typeof accountsEnvSchema>;

export type AccountsEnvResult =
  { ok: true; env: AccountsEnv } | { ok: false; problems: string[] };

/** Reads and checks the accounts settings. The problems name the variables, never their values. */
export function readAccountsEnv(
  source: Record<string, string | undefined>,
): AccountsEnvResult {
  const parsed = accountsEnvSchema.safeParse(source);
  if (parsed.success) return { ok: true, env: parsed.data };
  const problems = parsed.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return { ok: false, problems };
}
