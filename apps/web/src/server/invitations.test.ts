import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DATABASE_URL,
  createDb,
  shouldRunDatabaseTests,
} from "@sceneroom/db";
import {
  acceptInvitation,
  createInvitation,
  hashInvitationToken,
  listInvitations,
  previewInvitation,
  revokeInvitation,
} from "./invitations";
import { MAX_PENDING_INVITATIONS } from "./limits";
import { createProject } from "./projects";

// Real Postgres (docker compose up -d). This file only touches its own rows: users "iv-...".
const db = createDb(
  process.env.DATABASE_URL ??
    "postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom",
);
const P = "9e9e9e9e-0000-4000-8000-000000000001";
const Q = "9e9e9e9e-0000-4000-8000-000000000002";
const PEOPLE = [
  "owner",
  "editor",
  "commenter",
  "viewer",
  "stranger",
  "newbie",
  "other",
] as const;
type Person = (typeof PEOPLE)[number];
const uid = (p: Person) => `iv-${p}`;
const who = (p: Person) => ({ id: uid(p) });
const DAY = 86_400_000;

async function clean() {
  const mine = PEOPLE.map(uid);
  const projects = await db.project.findMany({
    where: { ownerId: { in: mine } },
    select: { id: true },
  });
  const ids = projects.map((p) => p.id);
  await db.invitation.deleteMany({ where: { projectId: { in: ids } } });
  await db.projectMember.deleteMany({ where: { projectId: { in: ids } } });
  await db.projectMember.deleteMany({ where: { userId: { in: mine } } });
  await db.project.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: mine } } });
}

const dbTests = await shouldRunDatabaseTests(
  process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
);
const describeDb = dbTests ? describe : describe.skip;

if (dbTests)
  beforeEach(async () => {
    await clean();
    for (const person of PEOPLE) {
      await db.user.create({
        data: {
          id: uid(person),
          name: person,
          email: `${uid(person)}@example.test`,
        },
      });
    }
    await createProject(db, who("owner"), {
      id: P,
      name: "Shared",
      entrySceneId: "scene-1",
    });
    for (const role of ["editor", "commenter", "viewer"] as const) {
      await db.projectMember.create({
        data: { projectId: P, userId: uid(role), role },
      });
    }
  });
if (dbTests)
  afterAll(async () => {
    await clean();
    await db.$disconnect();
  });

const invite = async (
  role: "editor" | "commenter" | "viewer" = "viewer",
  days = 7,
  now?: Date,
) => {
  const result = await createInvitation(
    db,
    who("owner"),
    P,
    { role, days },
    now,
  );
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describeDb("making an invitation", () => {
  it("only the owner may; everyone else is refused", async () => {
    for (const person of ["editor", "commenter", "viewer"] as const) {
      expect(
        await createInvitation(db, who(person), P, { role: "viewer", days: 7 }),
      ).toMatchObject({ ok: false, status: 403 });
    }
    expect(
      await createInvitation(db, who("stranger"), P, {
        role: "viewer",
        days: 7,
      }),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("gives a long random secret once, and keeps only its fingerprint", async () => {
    const made = await invite("editor", 3);
    expect(made.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await db.invitation.findUniqueOrThrow({
      where: { id: made.id },
    });
    expect(row.tokenHash).toBe(hashInvitationToken(made.token));
    expect(row.tokenHash).not.toContain(made.token);
    expect(JSON.stringify(row)).not.toContain(made.token);
    expect(row.role).toBe("editor");
    expect(made.expiresAt.getTime() - Date.now()).toBeGreaterThan(2.9 * DAY);
    expect(made.expiresAt.getTime() - Date.now()).toBeLessThan(3.1 * DAY);
    expect((await invite()).token).not.toBe(made.token);
  });

  it("stops at the limit of waiting invitations; used and expired ones do not count", async () => {
    for (let i = 0; i < MAX_PENDING_INVITATIONS; i++) await invite();
    expect(
      await createInvitation(db, who("owner"), P, { role: "viewer", days: 7 }),
    ).toMatchObject({ ok: false, status: 403 });
    await db.invitation.updateMany({
      where: { projectId: P },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await createInvitation(db, who("owner"), P, { role: "viewer", days: 7 }))
        .ok,
    ).toBe(true);
  });
});

describeDb("listing and revoking", () => {
  it("only the owner sees the list; it has statuses and never the secrets", async () => {
    const pending = await invite("viewer");
    const revoked = await invite("editor");
    await revokeInvitation(db, who("owner"), P, revoked.id);
    const old = await invite("viewer", 1, new Date(Date.now() - 5 * DAY));
    await acceptInvitation(db, who("newbie"), pending.token);
    const list = await listInvitations(db, who("owner"), P);
    if (!list.ok) throw new Error(list.error);
    const byId = Object.fromEntries(list.value.map((i) => [i.id, i.status]));
    expect(byId).toEqual({
      [pending.id]: "accepted",
      [revoked.id]: "revoked",
      [old.id]: "expired",
    });
    expect(list.value.find((i) => i.id === pending.id)?.acceptedBy).toBe(
      "newbie",
    );
    expect(JSON.stringify(list.value)).not.toContain(pending.token);
    expect(await listInvitations(db, who("editor"), P)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await listInvitations(db, who("stranger"), P)).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("a revoked link no longer works; a used one cannot be revoked", async () => {
    const made = await invite();
    expect(await revokeInvitation(db, who("editor"), P, made.id)).toMatchObject(
      { ok: false, status: 403 },
    );
    expect(await revokeInvitation(db, who("owner"), P, made.id)).toMatchObject({
      ok: true,
    });
    expect(await revokeInvitation(db, who("owner"), P, made.id)).toMatchObject({
      ok: true,
    });
    expect(await acceptInvitation(db, who("newbie"), made.token)).toMatchObject(
      { ok: false, status: 409, error: "This invitation was cancelled." },
    );
    const used = await invite();
    await acceptInvitation(db, who("newbie"), used.token);
    expect(await revokeInvitation(db, who("owner"), P, used.id)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(
      await revokeInvitation(
        db,
        who("owner"),
        P,
        "00000000-0000-4000-8000-000000000000",
      ),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("an invitation of another project cannot be revoked through this one", async () => {
    await createProject(db, who("stranger"), { id: Q, name: "Theirs" });
    const theirs = await createInvitation(db, who("stranger"), Q, {
      role: "viewer",
      days: 7,
    });
    if (!theirs.ok) throw new Error(theirs.error);
    expect(
      await revokeInvitation(db, who("owner"), P, theirs.value.id),
    ).toMatchObject({ ok: false, status: 404 });
    await db.invitation.deleteMany({ where: { projectId: Q } });
    await db.projectMember.deleteMany({ where: { projectId: Q } });
    await db.project.delete({ where: { id: Q } });
  });
});

describeDb("previewing a link", () => {
  it("shows the project name and role to whoever holds the secret", async () => {
    const made = await invite("commenter");
    expect(await previewInvitation(db, made.token)).toEqual({
      ok: true,
      value: { projectName: "Shared", role: "commenter" },
    });
  });

  it("says why a link cannot be used, and nothing for an unknown one", async () => {
    expect(await previewInvitation(db, "A".repeat(43))).toMatchObject({
      ok: false,
      status: 404,
    });
    const expired = await invite("viewer", 1, new Date(Date.now() - 5 * DAY));
    expect(await previewInvitation(db, expired.token)).toMatchObject({
      ok: false,
      error: "This invitation has expired.",
    });
    const revoked = await invite();
    await revokeInvitation(db, who("owner"), P, revoked.id);
    expect(await previewInvitation(db, revoked.token)).toMatchObject({
      ok: false,
      error: "This invitation was cancelled.",
    });
    const used = await invite();
    await acceptInvitation(db, who("newbie"), used.token);
    expect(await previewInvitation(db, used.token)).toMatchObject({
      ok: false,
      error: "This invitation was already used.",
    });
  });
});

describeDb("accepting", () => {
  it("makes the person a member with the invited role, once", async () => {
    const made = await invite("editor");
    const result = await acceptInvitation(db, who("newbie"), made.token);
    expect(result).toEqual({
      ok: true,
      value: {
        projectId: P,
        projectName: "Shared",
        role: "editor",
        entrySceneId: "scene-1",
        alreadyMember: false,
      },
    });
    const member = await db.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: P, userId: uid("newbie") } },
    });
    expect(member.role).toBe("editor");
    const row = await db.invitation.findUniqueOrThrow({
      where: { id: made.id },
    });
    expect(row.acceptedById).toBe(uid("newbie"));
    expect(row.acceptedAt).not.toBeNull();
    expect(await acceptInvitation(db, who("other"), made.token)).toMatchObject({
      ok: false,
      status: 409,
      error: "This invitation was already used.",
    });
    expect(
      await db.projectMember.count({
        where: { projectId: P, userId: uid("other") },
      }),
    ).toBe(0);
  });

  it("refuses an expired link and an unknown one", async () => {
    const old = await invite("viewer", 1, new Date(Date.now() - 5 * DAY));
    expect(await acceptInvitation(db, who("newbie"), old.token)).toMatchObject({
      ok: false,
      status: 409,
      error: "This invitation has expired.",
    });
    expect(
      await acceptInvitation(db, who("newbie"), "B".repeat(43)),
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      await db.projectMember.count({ where: { userId: uid("newbie") } }),
    ).toBe(0);
  });

  it("a person who is a member already keeps their role and the link is not used up", async () => {
    const made = await invite("viewer");
    const result = await acceptInvitation(db, who("editor"), made.token);
    expect(result).toMatchObject({
      ok: true,
      value: { role: "editor", alreadyMember: true },
    });
    expect(
      (await db.invitation.findUniqueOrThrow({ where: { id: made.id } }))
        .acceptedAt,
    ).toBeNull();
    expect(await acceptInvitation(db, who("newbie"), made.token)).toMatchObject(
      { ok: true },
    );
  });

  it("two people using one link at the same moment: exactly one gets in", async () => {
    const made = await invite("viewer");
    const results = await Promise.all([
      acceptInvitation(db, who("newbie"), made.token),
      acceptInvitation(db, who("other"), made.token),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      await db.projectMember.count({
        where: { projectId: P, userId: { in: [uid("newbie"), uid("other")] } },
      }),
    ).toBe(1);
  });
});
