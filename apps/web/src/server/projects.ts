import { permissionsOf, Prisma, type Db, type Role } from "@sceneroom/db";
import { MAX_ONLINE_PROJECTS_PER_USER } from "./limits";
import type { CreateProjectInput } from "./projectSchemas";

/** Who is asking. Every function here checks what this person may do; none of them trusts the caller. */
export type Actor = { id: string };

export type Failure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  error: string;
};
export type Success<T> = { ok: true; value: T };
export type Result<T> = Success<T> | Failure;

const ok = <T>(value: T): Success<T> => ({ ok: true, value });
const fail = (status: Failure["status"], error: string): Failure => ({
  ok: false,
  status,
  error,
});

/** Not a member and "no such project" look the same, so nobody can find out which project ids exist. */
const NOT_FOUND = fail(404, "No such project.");

export type ProjectSummary = {
  id: string;
  name: string;
  role: Role;
  createdAt: Date;
};

async function roleOf(
  db: Db,
  projectId: string,
  userId: string,
): Promise<Role | null> {
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

/**
 * Puts a project online with the actor as its owner. The id is the local project's id. Doing it again for the same
 * project by the same owner changes nothing (so a retry is safe); another person's project id is refused.
 */
export async function createProject(
  db: Db,
  actor: Actor,
  input: CreateProjectInput,
): Promise<Result<ProjectSummary>> {
  const existing = await db.project.findUnique({ where: { id: input.id } });
  if (existing) {
    if (existing.ownerId !== actor.id) {
      return fail(409, "That project id is already used.");
    }
    return ok({
      id: existing.id,
      name: existing.name,
      role: "owner",
      createdAt: existing.createdAt,
    });
  }
  const owned = await db.project.count({ where: { ownerId: actor.id } });
  if (owned >= MAX_ONLINE_PROJECTS_PER_USER) {
    return fail(
      403,
      `You can have at most ${MAX_ONLINE_PROJECTS_PER_USER} online projects.`,
    );
  }
  try {
    const project = await db.project.create({
      data: {
        id: input.id,
        name: input.name,
        ownerId: actor.id,
        members: { create: { userId: actor.id, role: "owner" } },
      },
    });
    return ok({
      id: project.id,
      name: project.name,
      role: "owner",
      createdAt: project.createdAt,
    });
  } catch (error) {
    // Someone made the same project between the check above and this write
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail(409, "That project id is already used.");
    }
    throw error;
  }
}

/** The projects this person is a member of, newest first, with their role in each. */
export async function listMyProjects(
  db: Db,
  actor: Actor,
): Promise<ProjectSummary[]> {
  const rows = await db.projectMember.findMany({
    where: { userId: actor.id },
    include: { project: true },
    orderBy: { project: { createdAt: "desc" } },
  });
  return rows.map((row) => ({
    id: row.project.id,
    name: row.project.name,
    role: row.role,
    createdAt: row.project.createdAt,
  }));
}

/** One project, if the actor is a member. */
export async function getProject(
  db: Db,
  actor: Actor,
  projectId: string,
): Promise<Result<ProjectSummary>> {
  const role = await roleOf(db, projectId, actor.id);
  if (!role) return NOT_FOUND;
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return NOT_FOUND;
  return ok({
    id: project.id,
    name: project.name,
    role,
    createdAt: project.createdAt,
  });
}

export type MemberView = {
  userId: string;
  name: string;
  image: string | null;
  /** Only shown to people who may invite (the owner): an email is not something every member should see. */
  email: string | null;
  role: Role;
  addedAt: Date;
};

/** The members of a project, for any member. */
export async function listMembers(
  db: Db,
  actor: Actor,
  projectId: string,
): Promise<Result<MemberView[]>> {
  const role = await roleOf(db, projectId, actor.id);
  if (!role) return NOT_FOUND;
  const showEmail = permissionsOf(role).canInvite;
  const rows = await db.projectMember.findMany({
    where: { projectId },
    include: { user: true },
    orderBy: { addedAt: "asc" },
  });
  return ok(
    rows.map((row) => ({
      userId: row.userId,
      name: row.user.name,
      image: row.user.image,
      email: showEmail ? row.user.email : null,
      role: row.role,
      addedAt: row.addedAt,
    })),
  );
}

/** Changes a member's role. Only the owner may; the owner's own role cannot be changed. */
export async function changeMemberRole(
  db: Db,
  actor: Actor,
  projectId: string,
  userId: string,
  role: Exclude<Role, "owner">,
): Promise<Result<{ userId: string; role: Role }>> {
  const mine = await roleOf(db, projectId, actor.id);
  if (!mine) return NOT_FOUND;
  if (!permissionsOf(mine).canInvite) {
    return fail(403, "Only the owner can change roles.");
  }
  const target = await roleOf(db, projectId, userId);
  if (!target) return fail(404, "That person is not a member.");
  if (target === "owner") {
    return fail(400, "The owner's role cannot be changed.");
  }
  await db.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { role },
  });
  return ok({ userId, role });
}

/**
 * Removes a member. The owner may remove anyone but themself; any other member may remove only themself (leave).
 * The owner cannot leave: delete the project instead.
 */
export async function removeMember(
  db: Db,
  actor: Actor,
  projectId: string,
  userId: string,
): Promise<Result<{ userId: string }>> {
  const mine = await roleOf(db, projectId, actor.id);
  if (!mine) return NOT_FOUND;
  const leaving = userId === actor.id;
  if (!leaving && !permissionsOf(mine).canInvite) {
    return fail(403, "Only the owner can remove other people.");
  }
  const target = leaving ? mine : await roleOf(db, projectId, userId);
  if (!target) return fail(404, "That person is not a member.");
  if (target === "owner") {
    return fail(
      400,
      "The owner cannot be removed. Delete the project instead.",
    );
  }
  await db.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });
  return ok({ userId });
}

/** Deletes the project, its members and its invitations. Only the owner may. */
export async function deleteProject(
  db: Db,
  actor: Actor,
  projectId: string,
): Promise<Result<{ id: string }>> {
  const mine = await roleOf(db, projectId, actor.id);
  if (!mine) return NOT_FOUND;
  if (!permissionsOf(mine).canDeleteProject) {
    return fail(403, "Only the owner can delete the project.");
  }
  await db.project.delete({ where: { id: projectId } });
  return ok({ id: projectId });
}
