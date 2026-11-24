import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "@sceneroom/db";
import { verifyLinkToken } from "@sceneroom/link-token";
import { issueCollabToken } from "./collabToken";
import { COLLAB_TOKEN_TTL_SECONDS } from "./limits";
import { createProject } from "./projects";

// Real Postgres (docker compose up -d); this file only touches its own rows (users "ct-...").
const db = createDb(
  process.env.DATABASE_URL ??
    "postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom",
);
const SECRET = "k".repeat(40);
const P = "8d8d8d8d-0000-4000-8000-000000000001";
const ROLES = ["owner", "editor", "commenter", "viewer"] as const;
const IDS = [...ROLES, "stranger"].map((name) => `ct-${name}`);

async function clean() {
  await db.projectMember.deleteMany({ where: { projectId: P } });
  await db.project.deleteMany({ where: { id: P } });
  await db.user.deleteMany({ where: { id: { in: IDS } } });
}

beforeEach(async () => {
  await clean();
  for (const id of IDS) {
    await db.user.create({
      data: { id, name: id, email: `${id}@example.test` },
    });
  }
  await createProject(db, { id: "ct-owner" }, { id: P, name: "T" });
  for (const role of ["editor", "commenter", "viewer"] as const) {
    await db.projectMember.create({
      data: { projectId: P, userId: `ct-${role}`, role },
    });
  }
});
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("issueCollabToken", () => {
  const expected = {
    owner: "editor",
    editor: "editor",
    commenter: "viewer",
    viewer: "viewer",
  } as const;
  for (const role of ROLES) {
    it(`a ${role} gets a ${expected[role]} token, made for them, for this project that the collab server accepts`, async () => {
      const now = 1_000_000;
      const result = await issueCollabToken(
        db,
        { id: `ct-${role}` },
        P,
        SECRET,
        now,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.role).toBe(expected[role]);
      expect(result.value.expiresAt).toBe(now + COLLAB_TOKEN_TTL_SECONDS);
      expect(verifyLinkToken(result.value.token, SECRET, now)).toEqual({
        ok: true,
        projectId: P,
        role: expected[role],
        generation: 0,
        userId: `ct-${role}`,
      });
    });
  }

  it("the token stops working after an hour, and not with another secret", async () => {
    const now = 1_000_000;
    const result = await issueCollabToken(
      db,
      { id: "ct-editor" },
      P,
      SECRET,
      now,
    );
    if (!result.ok) throw new Error("expected a token");
    expect(
      verifyLinkToken(
        result.value.token,
        SECRET,
        now + COLLAB_TOKEN_TTL_SECONDS,
      ),
    ).toEqual({ ok: false, reason: "expired" });
    expect(verifyLinkToken(result.value.token, "z".repeat(40), now)).toEqual({
      ok: false,
      reason: "bad signature",
    });
  });

  it("a person who is not a member, or a project that does not exist, gets 404 and no token", async () => {
    expect(
      await issueCollabToken(db, { id: "ct-stranger" }, P, SECRET),
    ).toEqual({
      ok: false,
      status: 404,
      error: "No such project.",
    });
    expect(
      await issueCollabToken(
        db,
        { id: "ct-owner" },
        "8d8d8d8d-0000-4000-8000-000000000009",
        SECRET,
      ),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("a removed member gets no new token", async () => {
    await db.projectMember.delete({
      where: { projectId_userId: { projectId: P, userId: "ct-editor" } },
    });
    expect(
      await issueCollabToken(db, { id: "ct-editor" }, P, SECRET),
    ).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});
