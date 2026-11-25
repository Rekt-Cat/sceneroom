import { signAdminRequest } from "@sceneroom/link-token";
import type { AccountsEnv } from "./accountsEnv";

/** How long to wait for the collab server before giving up (ms). The removal itself has already happened. */
const TIMEOUT_MS = 3000;

/**
 * Tells the collab server to close the connections of a project: one person's, or everybody's when `userId` is left out.
 * They reconnect at once and are refused if they are no longer allowed (their token is asked for again).
 *
 * Best effort: the change in the database has already been made and is what decides, so a failure here is only logged.
 * Without `COLLAB_ADMIN_URL` nothing is sent, and the person is cut off at their next connect instead. Never throws.
 */
export async function disconnectFromCollab(
  env: Pick<AccountsEnv, "COLLAB_SECRET" | "COLLAB_ADMIN_URL">,
  target: { projectId: string; userId?: string },
  options: { fetchImpl?: typeof fetch; nowSeconds?: () => number } = {},
): Promise<void> {
  if (!env.COLLAB_ADMIN_URL) return;
  const call = options.fetchImpl ?? ((...args) => fetch(...args));
  const timestamp = (
    options.nowSeconds ?? (() => Math.floor(Date.now() / 1000))
  )();
  const body = JSON.stringify(
    target.userId
      ? { projectId: target.projectId, userId: target.userId }
      : { projectId: target.projectId },
  );
  try {
    const response = await call(
      new URL("/internal/disconnect", env.COLLAB_ADMIN_URL),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Timestamp": String(timestamp),
          "X-Admin-Signature": signAdminRequest(
            env.COLLAB_SECRET,
            timestamp,
            body,
          ),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.warn(
        `The collab server did not accept the disconnect request (${response.status}); the person is cut off at their next connect.`,
      );
    }
  } catch (error) {
    console.warn(
      "Could not reach the collab server to disconnect someone; they are cut off at their next connect:",
      error,
    );
  }
}
