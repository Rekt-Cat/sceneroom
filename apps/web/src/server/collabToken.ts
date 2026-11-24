import { collabAccess, type Db } from "@sceneroom/db";
import { createLinkToken, type LinkRole } from "@sceneroom/link-token";
import { COLLAB_TOKEN_TTL_SECONDS } from "./limits";
import { roleOf, type Actor, type Result } from "./projects";

export type IssuedToken = {
  token: string;
  /** What the collab server will let this connection do. */
  role: LinkRole;
  /** When the token stops working, seconds since 1970. */
  expiresAt: number;
};

/**
 * Signs a collab token for a member of the project: read-write for owner and editor, read-only for commenter and viewer.
 * A person who is not a member gets "no such project" (the same answer as for a project that does not exist). The token
 * is short-lived, so removing a member or changing a role takes effect at their next connection at the latest.
 */
export async function issueCollabToken(
  db: Db,
  actor: Actor,
  projectId: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<Result<IssuedToken>> {
  const role = await roleOf(db, projectId, actor.id);
  if (!role) return { ok: false, status: 404, error: "No such project." };
  const linkRole: LinkRole =
    collabAccess(role) === "read-write" ? "editor" : "viewer";
  const expiresAt = nowSeconds + COLLAB_TOKEN_TTL_SECONDS;
  const token = createLinkToken(
    { projectId, role: linkRole, userId: actor.id },
    secret,
    expiresAt,
  );
  return { ok: true, value: { token, role: linkRole, expiresAt } };
}
