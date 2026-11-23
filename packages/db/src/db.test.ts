import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { collabAccess, createDb, permissionsOf, Prisma, Role } from "./index";

// These tests use the real Postgres of docker-compose.yml (docker compose up -d). They clean the tables first, so run
// them against the development database only.
const db = createDb(process.env.DATABASE_URL);

async function clean() {
  await db.invitation.deleteMany();
  await db.projectMember.deleteMany();
  await db.project.deleteMany();
  await db.user.deleteMany();
}

async function twoUsersAndAProject() {
  const alice = await db.user.create({
    data: { id: "u-alice", name: "Alice", email: "alice@example.test" },
  });
  const bob = await db.user.create({
    data: { id: "u-bob", name: "Bob", email: "bob@example.test" },
  });
  const project = await db.project.create({
    data: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "P",
      ownerId: alice.id,
      members: { create: { userId: alice.id, role: "owner" } },
    },
  });
  return { alice, bob, project };
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("roles", () => {
  it("only owner and editor may edit; only the owner invites and deletes", () => {
    expect(permissionsOf(Role.owner)).toEqual({
      canEdit: true,
      canInvite: true,
      canDeleteProject: true,
    });
    expect(permissionsOf(Role.editor)).toEqual({
      canEdit: true,
      canInvite: false,
      canDeleteProject: false,
    });
    expect(permissionsOf(Role.commenter).canEdit).toBe(false);
    expect(permissionsOf(Role.viewer).canEdit).toBe(false);
  });

  it("owner and editor connect read-write; commenter and viewer read-only", () => {
    expect(collabAccess(Role.owner)).toBe("read-write");
    expect(collabAccess(Role.editor)).toBe("read-write");
    expect(collabAccess(Role.commenter)).toBe("read-only");
    expect(collabAccess(Role.viewer)).toBe("read-only");
  });
});

describe("database rules", () => {
  it("a person is a member of a project only once", async () => {
    const { bob, project } = await twoUsersAndAProject();
    await db.projectMember.create({
      data: { projectId: project.id, userId: bob.id, role: "viewer" },
    });
    await expect(
      db.projectMember.create({
        data: { projectId: project.id, userId: bob.id, role: "editor" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("two accounts cannot share an email", async () => {
    await twoUsersAndAProject();
    await expect(
      db.user.create({
        data: { id: "u-x", name: "X", email: "alice@example.test" },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("a role outside the four is refused", async () => {
    const { bob, project } = await twoUsersAndAProject();
    await expect(
      db.projectMember.create({
        // @ts-expect-error not a Role: the database must refuse it too
        data: { projectId: project.id, userId: bob.id, role: "admin" },
      }),
    ).rejects.toThrow();
  });

  it("a user who owns a project cannot be deleted by accident", async () => {
    const { alice } = await twoUsersAndAProject();
    await expect(db.user.delete({ where: { id: alice.id } })).rejects.toThrow();
  });

  it("deleting a project removes its members and invitations", async () => {
    const { alice, bob, project } = await twoUsersAndAProject();
    await db.projectMember.create({
      data: { projectId: project.id, userId: bob.id, role: "editor" },
    });
    await db.invitation.create({
      data: {
        projectId: project.id,
        role: "viewer",
        tokenHash: "hash-1",
        expiresAt: new Date(Date.now() + 1000),
        createdById: alice.id,
      },
    });
    await db.project.delete({ where: { id: project.id } });
    expect(await db.projectMember.count()).toBe(0);
    expect(await db.invitation.count()).toBe(0);
  });

  it("an invitation token hash is unique, and removing the person who accepted keeps the invitation", async () => {
    const { alice, bob, project } = await twoUsersAndAProject();
    const data = {
      projectId: project.id,
      role: "viewer" as const,
      tokenHash: "same-hash",
      expiresAt: new Date(Date.now() + 1000),
      createdById: alice.id,
    };
    const first = await db.invitation.create({
      data: { ...data, acceptedById: bob.id, acceptedAt: new Date() },
    });
    await expect(db.invitation.create({ data })).rejects.toMatchObject({
      code: "P2002",
    });
    await db.user.delete({ where: { id: bob.id } });
    const kept = await db.invitation.findUnique({ where: { id: first.id } });
    expect(kept?.acceptedById).toBeNull();
  });

  it("deleting a user ends their sessions and sign-in accounts", async () => {
    const { bob } = await twoUsersAndAProject();
    await db.session.create({
      data: {
        id: "s1",
        token: "t1",
        userId: bob.id,
        expiresAt: new Date(Date.now() + 1000),
      },
    });
    await db.account.create({
      data: {
        id: "a1",
        accountId: "gh-1",
        providerId: "github",
        userId: bob.id,
      },
    });
    await db.user.delete({ where: { id: bob.id } });
    expect(await db.session.count()).toBe(0);
    expect(await db.account.count()).toBe(0);
  });
});
