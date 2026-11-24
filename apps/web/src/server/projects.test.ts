import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "@sceneroom/db";
import {
  changeMemberRole,
  createProject,
  deleteProject,
  getProject,
  listMembers,
  listMyProjects,
  removeMember,
} from "./projects";
import { MAX_ONLINE_PROJECTS_PER_USER } from "./limits";

// Real Postgres (docker compose up -d). Other test files use the same database at the same time, so this file only
// ever creates and removes rows of its own: users "pt-...", and the projects those users own.
const db = createDb(
  process.env.DATABASE_URL ??
    "postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom",
);

const P = "5a5a5a5a-0000-4000-8000-000000000001";
const Q = "5a5a5a5a-0000-4000-8000-000000000002";
const PEOPLE = ["owner", "editor", "commenter", "viewer", "stranger"] as const;
type Person = (typeof PEOPLE)[number];

/** The user id of a test person, and the "who is asking" value for the functions under test. */
const uid = (person: Person) => `pt-${person}`;
const who = (person: Person) => ({ id: uid(person) });

async function clean() {
  const mine = PEOPLE.map(uid);
  const projects = await db.project.findMany({
    where: { ownerId: { in: mine } },
    select: { id: true },
  });
  const ids = projects.map((project) => project.id);
  await db.invitation.deleteMany({ where: { projectId: { in: ids } } });
  await db.projectMember.deleteMany({ where: { projectId: { in: ids } } });
  await db.project.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: mine } } });
}

/** One project with one person in every role, and a stranger who is not a member. */
async function setup() {
  for (const person of PEOPLE) {
    await db.user.create({
      data: {
        id: uid(person),
        name: person,
        email: `${uid(person)}@example.test`,
      },
    });
  }
  await createProject(db, who("owner"), { id: P, name: "Shared" });
  for (const role of ["editor", "commenter", "viewer"] as const) {
    await db.projectMember.create({
      data: { projectId: P, userId: uid(role), role },
    });
  }
}

beforeEach(async () => {
  await clean();
  await setup();
});
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

const memberRole = async (person: Person) =>
  (
    await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: P, userId: uid(person) } },
    })
  )?.role;

describe("createProject", () => {
  it("makes the actor the owner and a member", async () => {
    const mine = await listMyProjects(db, who("owner"));
    expect(mine).toMatchObject([{ id: P, name: "Shared", role: "owner" }]);
  });

  it("is safe to repeat for the owner and refused for anyone else", async () => {
    const again = await createProject(db, who("owner"), {
      id: P,
      name: "Other name",
    });
    expect(again).toMatchObject({ ok: true, value: { name: "Shared" } });
    expect(await db.projectMember.count({ where: { projectId: P } })).toBe(4);
    const taken = await createProject(db, who("stranger"), {
      id: P,
      name: "Mine",
    });
    expect(taken).toMatchObject({ ok: false, status: 409 });
  });

  it("stops at the limit of online projects", async () => {
    await db.project.createMany({
      data: Array.from(
        { length: MAX_ONLINE_PROJECTS_PER_USER - 1 },
        (_, i) => ({
          id: `5a5a5a5a-0000-4000-8000-${String(100 + i).padStart(12, "0")}`,
          name: `p${i}`,
          ownerId: uid("owner"),
        }),
      ),
    });
    const over = await createProject(db, who("owner"), {
      id: Q,
      name: "One too many",
    });
    expect(over).toMatchObject({ ok: false, status: 403 });
  });
});

describe("who can see a project", () => {
  it("every member sees it with their own role; a stranger gets 'no such project'", async () => {
    for (const role of ["owner", "editor", "commenter", "viewer"] as const) {
      expect(await getProject(db, who(role), P)).toMatchObject({
        ok: true,
        value: { role },
      });
      const members = await listMembers(db, who(role), P);
      expect(members.ok && members.value.length).toBe(4);
    }
    expect(await getProject(db, who("stranger"), P)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await listMembers(db, who("stranger"), P)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await getProject(db, who("owner"), Q)).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("only the owner sees the members' email addresses", async () => {
    const asOwner = await listMembers(db, who("owner"), P);
    const asViewer = await listMembers(db, who("viewer"), P);
    expect(asOwner.ok && asOwner.value.every((m) => m.email)).toBe(true);
    expect(asViewer.ok && asViewer.value.every((m) => m.email === null)).toBe(
      true,
    );
  });

  it("the list of my projects holds only mine", async () => {
    await createProject(db, who("stranger"), { id: Q, name: "Theirs" });
    const mine = await listMyProjects(db, who("viewer"));
    expect(mine.map((p) => p.id)).toEqual([P]);
    expect(mine[0].role).toBe("viewer");
  });
});

describe("changing a role", () => {
  const cases: [Person, number | "ok"][] = [
    ["owner", "ok"],
    ["editor", 403],
    ["commenter", 403],
    ["viewer", 403],
    ["stranger", 404],
  ];
  for (const [person, expected] of cases) {
    it(`${person} ${expected === "ok" ? "may" : "may not"} change someone's role`, async () => {
      const result = await changeMemberRole(
        db,
        who(person),
        P,
        uid("viewer"),
        "editor",
      );
      if (expected === "ok") expect(result).toMatchObject({ ok: true });
      else expect(result).toMatchObject({ ok: false, status: expected });
      expect(await memberRole("viewer")).toBe(
        expected === "ok" ? "editor" : "viewer",
      );
    });
  }

  it("the owner's role cannot be changed, and a non-member cannot be given one", async () => {
    expect(
      await changeMemberRole(db, who("owner"), P, uid("owner"), "viewer"),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await changeMemberRole(db, who("owner"), P, uid("stranger"), "viewer"),
    ).toMatchObject({ ok: false, status: 404 });
  });
});

describe("removing a member", () => {
  it("the owner can remove anyone else", async () => {
    expect(
      await removeMember(db, who("owner"), P, uid("editor")),
    ).toMatchObject({ ok: true });
    expect(await db.projectMember.count({ where: { projectId: P } })).toBe(3);
  });

  it("members may not remove others, but may leave themselves", async () => {
    for (const person of ["editor", "commenter", "viewer"] as const) {
      expect(
        await removeMember(db, who(person), P, uid("owner")),
      ).toMatchObject({ ok: false, status: 403 });
    }
    expect(
      await removeMember(db, who("viewer"), P, uid("viewer")),
    ).toMatchObject({ ok: true });
    expect(await memberRole("viewer")).toBeUndefined();
    expect(
      await removeMember(db, who("stranger"), P, uid("editor")),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("the owner cannot be removed, not even by themself", async () => {
    expect(await removeMember(db, who("owner"), P, uid("owner"))).toMatchObject(
      { ok: false, status: 400 },
    );
  });

  it("a person who is not a member cannot be removed", async () => {
    expect(
      await removeMember(db, who("owner"), P, uid("stranger")),
    ).toMatchObject({ ok: false, status: 404 });
  });
});

describe("deleting a project", () => {
  const cases: [Person, number | "ok"][] = [
    ["editor", 403],
    ["commenter", 403],
    ["viewer", 403],
    ["stranger", 404],
    ["owner", "ok"],
  ];
  for (const [person, expected] of cases) {
    it(`${person} ${expected === "ok" ? "may" : "may not"} delete it`, async () => {
      const result = await deleteProject(db, who(person), P);
      if (expected === "ok") expect(result).toMatchObject({ ok: true });
      else expect(result).toMatchObject({ ok: false, status: expected });
      expect(await db.project.count({ where: { id: P } })).toBe(
        expected === "ok" ? 0 : 1,
      );
    });
  }
});
