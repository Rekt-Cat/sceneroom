import { createHash, randomBytes } from "node:crypto";
import { permissionsOf, type Db, type Role } from "@sceneroom/db";
import { MAX_PENDING_INVITATIONS } from "./limits";
import { roleOf, type Actor, type Failure, type Result } from "./projects";

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (status: Failure["status"], error: string): Failure => ({
  ok: false,
  status,
  error,
});
const NOT_FOUND = fail(404, "No such project.");
const DAY_MS = 86_400_000;

/** Only this fingerprint of an invitation's secret is stored, never the secret itself (like the owner key). */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

function statusOf(
  row: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): InvitationStatus {
  if (row.acceptedAt) return "accepted";
  if (row.revokedAt) return "revoked";
  if (row.expiresAt <= now) return "expired";
  return "pending";
}

export type CreatedInvitation = {
  id: string;
  /** The secret for the link. Shown once: only its fingerprint is kept. */
  token: string;
  role: Role;
  expiresAt: Date;
};

/** Makes an invitation link for a role (owner only, up to the limit of waiting ones). */
export async function createInvitation(
  db: Db,
  actor: Actor,
  projectId: string,
  input: { role: Exclude<Role, "owner">; days: number },
  now: Date = new Date(),
): Promise<Result<CreatedInvitation>> {
  const mine = await roleOf(db, projectId, actor.id);
  if (!mine) return NOT_FOUND;
  if (!permissionsOf(mine).canInvite) {
    return fail(403, "Only the owner can invite people.");
  }
  const waiting = await db.invitation.count({
    where: {
      projectId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
  });
  if (waiting >= MAX_PENDING_INVITATIONS) {
    return fail(
      403,
      `There are already ${MAX_PENDING_INVITATIONS} invitations waiting. Revoke some first.`,
    );
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + input.days * DAY_MS);
  const row = await db.invitation.create({
    data: {
      projectId,
      role: input.role,
      tokenHash: hashInvitationToken(token),
      expiresAt,
      createdById: actor.id,
    },
  });
  return ok({ id: row.id, token, role: row.role, expiresAt });
}

export type InvitationView = {
  id: string;
  role: Role;
  status: InvitationStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedBy: string | null;
};

/** The invitations of a project, newest first, without their secrets (owner only). */
export async function listInvitations(
  db: Db,
  actor: Actor,
  projectId: string,
  now: Date = new Date(),
): Promise<Result<InvitationView[]>> {
  const mine = await roleOf(db, projectId, actor.id);
  if (!mine) return NOT_FOUND;
  if (!permissionsOf(mine).canInvite) {
    return fail(403, "Only the owner can see invitations.");
  }
  const rows = await db.invitation.findMany({
    where: { projectId },
    include: { acceptedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok(
    rows.map((row) => ({
      id: row.id,
      role: row.role,
      status: statusOf(row, now),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      acceptedBy: row.acceptedBy?.name ?? null,
    })),
  );
}

/** Cancels an invitation that nobody has used yet (owner only). */
export async function revokeInvitation(
  db: Db,
  actor: Actor,
  projectId: string,
  invitationId: string,
  now: Date = new Date(),
): Promise<Result<{ id: string }>> {
  const mine = await roleOf(db, projectId, actor.id);
  if (!mine) return NOT_FOUND;
  if (!permissionsOf(mine).canInvite) {
    return fail(403, "Only the owner can revoke invitations.");
  }
  const row = await db.invitation.findFirst({
    where: { id: invitationId, projectId },
  });
  if (!row) return fail(404, "No such invitation.");
  if (row.acceptedAt) {
    return fail(
      409,
      "That invitation was already used. Remove the person instead.",
    );
  }
  if (!row.revokedAt) {
    await db.invitation.update({
      where: { id: row.id },
      data: { revokedAt: now },
    });
  }
  return ok({ id: row.id });
}

export type InvitationPreview = { projectName: string; role: Role };

/** Why a link cannot be used, in words for the person who clicked it. */
function problemWith(status: InvitationStatus): Failure | null {
  if (status === "accepted")
    return fail(409, "This invitation was already used.");
  if (status === "revoked") return fail(409, "This invitation was cancelled.");
  if (status === "expired") return fail(409, "This invitation has expired.");
  return null;
}

/**
 * What a link is for (the project's name and the role), so the page can say so before anyone signs in. The secret is the
 * only key: nothing else about the project is shown.
 */
export async function previewInvitation(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<Result<InvitationPreview>> {
  const row = await db.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { project: { select: { name: true } } },
  });
  if (!row) return fail(404, "This invitation link is not valid.");
  const problem = problemWith(statusOf(row, now));
  if (problem) return problem;
  return ok({ projectName: row.project.name, role: row.role });
}

export type Accepted = {
  projectId: string;
  projectName: string;
  role: Role;
  entrySceneId: string | null;
  /** True when the person was a member already: nothing changed and the invitation was not used up. */
  alreadyMember: boolean;
};

/**
 * Uses an invitation: the signed-in person becomes a member with the invited role, once. Two people clicking the same link
 * at the same moment: only one wins (the claim is a single conditional update).
 */
export async function acceptInvitation(
  db: Db,
  actor: Actor,
  token: string,
  now: Date = new Date(),
): Promise<Result<Accepted>> {
  const row = await db.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { project: true },
  });
  if (!row) return fail(404, "This invitation link is not valid.");
  const problem = problemWith(statusOf(row, now));
  if (problem) return problem;

  const existing = await roleOf(db, row.projectId, actor.id);
  if (existing) {
    return ok({
      projectId: row.projectId,
      projectName: row.project.name,
      role: existing,
      entrySceneId: row.project.entrySceneId,
      alreadyMember: true,
    });
  }

  const claimed = await db.$transaction(async (tx) => {
    const claim = await tx.invitation.updateMany({
      where: {
        id: row.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { acceptedById: actor.id, acceptedAt: now },
    });
    if (claim.count !== 1) return false;
    await tx.projectMember.create({
      data: { projectId: row.projectId, userId: actor.id, role: row.role },
    });
    return true;
  });
  if (!claimed) return fail(409, "This invitation was already used.");
  return ok({
    projectId: row.projectId,
    projectName: row.project.name,
    role: row.role,
    entrySceneId: row.project.entrySceneId,
    alreadyMember: false,
  });
}
