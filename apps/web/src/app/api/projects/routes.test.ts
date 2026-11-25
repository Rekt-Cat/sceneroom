import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, shouldRunDatabaseTests } from "@sceneroom/db";
import { verifyLinkToken } from "@sceneroom/link-token";
import type { CurrentUser } from "@/server/session";

// Sign-in itself is tested elsewhere (it needs GitHub); here the signed-in person is faked. Everything else is real:
// the routes, the checks and the Postgres of docker-compose.yml.
let signedIn: CurrentUser | null = null;
vi.mock("@/server/session", () => ({ getCurrentUser: async () => signedIn }));
const disconnected: { projectId: string; userId?: string }[] = [];
vi.mock("@/server/collabAdmin", () => ({
  disconnectFromCollab: async (
    _env: unknown,
    target: { projectId: string; userId?: string },
  ) => {
    disconnected.push(target);
  },
}));

const DATABASE_URL =
  "postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom";
vi.stubEnv("DATABASE_URL", DATABASE_URL);
vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(40));
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
vi.stubEnv("GITHUB_CLIENT_ID", "id");
vi.stubEnv("GITHUB_CLIENT_SECRET", "secret");
vi.stubEnv("COLLAB_SECRET", "c".repeat(40));

const projects = await import("./route");
const one = await import("./[id]/route");
const members = await import("./[id]/members/route");
const tokenRoute = await import("./[id]/token/route");
const invitations = await import("./[id]/invitations/route");
const invitation = await import("./[id]/invitations/[invitationId]/route");
const accept = await import("../invitations/accept/route");
const preview = await import("../invitations/preview/route");
const member = await import("./[id]/members/[userId]/route");

const db = createDb(DATABASE_URL);
const P = "7c7c7c7c-0000-4000-8000-000000000001";
const ME = "rt-me";
const FRIEND = "rt-friend";
const user = (id: string): CurrentUser => ({
  id,
  name: id,
  email: `${id}@example.test`,
  image: null,
});

async function clean() {
  const owned = await db.project.findMany({
    where: { ownerId: { in: [ME, FRIEND] } },
    select: { id: true },
  });
  const ids = owned.map((p) => p.id);
  await db.projectMember.deleteMany({ where: { projectId: { in: ids } } });
  await db.project.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: [ME, FRIEND] } } });
}

const dbTests = await shouldRunDatabaseTests(DATABASE_URL);
const describeDb = dbTests ? describe : describe.skip;

if (dbTests)
  beforeEach(async () => {
    disconnected.length = 0;
    await clean();
    for (const id of [ME, FRIEND]) {
      await db.user.create({
        data: { id, name: id, email: `${id}@example.test` },
      });
    }
    signedIn = user(ME);
  });
if (dbTests)
  afterAll(async () => {
    await clean();
    await db.$disconnect();
  });

const url = (path: string) => `http://localhost:3000/api/projects${path}`;
function send(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(url(path), {
    method,
    headers: { "content-type": "application/json", ...headers },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
}
const ctx = <T extends object>(params: T) => ({
  params: Promise.resolve(params),
});

describeDb("who may call", () => {
  it("answers 401 when nobody is signed in, on every route", async () => {
    signedIn = null;
    const answers = await Promise.all([
      projects.GET(send("GET", "")),
      projects.POST(send("POST", "", { id: P, name: "x" })),
      one.GET(send("GET", `/${P}`), ctx({ id: P }) as never),
      one.DELETE(send("DELETE", `/${P}`), ctx({ id: P }) as never),
      members.GET(send("GET", `/${P}/members`), ctx({ id: P }) as never),
      member.PATCH(
        send("PATCH", `/${P}/members/x`, { role: "viewer" }),
        ctx({ id: P, userId: "x" }) as never,
      ),
      member.DELETE(
        send("DELETE", `/${P}/members/x`),
        ctx({ id: P, userId: "x" }) as never,
      ),
      tokenRoute.POST(send("POST", `/${P}/token`), ctx({ id: P }) as never),
    ]);
    expect(answers.map((a) => a.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401, 401,
    ]);
  });

  it("refuses a change that a page on another site sent", async () => {
    const response = await projects.POST(
      send(
        "POST",
        "",
        { id: P, name: "x" },
        { origin: "https://evil.example" },
      ),
    );
    expect(response.status).toBe(403);
    expect(await db.project.count({ where: { id: P } })).toBe(0);
  });

  it("accepts a change from this site", async () => {
    const response = await projects.POST(
      send(
        "POST",
        "",
        { id: P, name: "x" },
        { origin: "http://localhost:3000" },
      ),
    );
    expect(response.status).toBe(201);
  });
});

describeDb("what is accepted", () => {
  it("refuses bodies that are not JSON, not the right shape, or too big", async () => {
    expect((await projects.POST(send("POST", "", "{not json"))).status).toBe(
      400,
    );
    expect(
      (await projects.POST(send("POST", "", { id: "not-a-uuid", name: "x" })))
        .status,
    ).toBe(400);
    expect(
      (await projects.POST(send("POST", "", { id: P, name: "   " }))).status,
    ).toBe(400);
    expect(
      (await projects.POST(send("POST", "", { id: P, name: "n".repeat(101) })))
        .status,
    ).toBe(400);
    expect(
      (await projects.POST(send("POST", "", { id: P, name: "x".repeat(5000) })))
        .status,
    ).toBe(413);
    expect(await db.project.count({ where: { id: P } })).toBe(0);
  });

  it("a path value that is not an id is 'no such project'", async () => {
    expect(
      (await one.GET(send("GET", "/nope"), ctx({ id: "nope" }) as never))
        .status,
    ).toBe(404);
  });

  it("only editor, commenter and viewer can be chosen as a role", async () => {
    await projects.POST(send("POST", "", { id: P, name: "x" }));
    await db.projectMember.create({
      data: { projectId: P, userId: FRIEND, role: "viewer" },
    });
    for (const role of ["owner", "admin", ""]) {
      const response = await member.PATCH(
        send("PATCH", `/${P}/members/${FRIEND}`, { role }),
        ctx({ id: P, userId: FRIEND }) as never,
      );
      expect(response.status).toBe(400);
    }
  });
});

describeDb("the collab token route", () => {
  it("a member gets a token whose role follows their role; a stranger gets nothing", async () => {
    await projects.POST(send("POST", "", { id: P, name: "x" }));
    await db.projectMember.create({
      data: { projectId: P, userId: FRIEND, role: "viewer" },
    });
    const asOwner = await tokenRoute.POST(
      send("POST", `/${P}/token`),
      ctx({ id: P }) as never,
    );
    expect(asOwner.status).toBe(200);
    expect(asOwner.headers.get("cache-control")).toBe("no-store");
    const owner = await asOwner.json();
    expect(owner.role).toBe("editor");
    expect(verifyLinkToken(owner.token, "c".repeat(40))).toMatchObject({
      ok: true,
      projectId: P,
      role: "editor",
    });

    signedIn = user(FRIEND);
    const viewer = await (
      await tokenRoute.POST(
        send("POST", `/${P}/token`),
        ctx({ id: P }) as never,
      )
    ).json();
    expect(viewer.role).toBe("viewer");

    await db.projectMember.deleteMany({ where: { userId: FRIEND } });
    const gone = await tokenRoute.POST(
      send("POST", `/${P}/token`),
      ctx({ id: P }) as never,
    );
    expect(gone.status).toBe(404);
    expect(JSON.stringify(await gone.json())).not.toContain("token");
  });

  it("a path value that is not an id gets 404", async () => {
    const response = await tokenRoute.POST(
      send("POST", "/nope/token"),
      ctx({ id: "nope" }) as never,
    );
    expect(response.status).toBe(404);
  });
});

describeDb("the whole journey through the routes", () => {
  it("create, list, look, change a role, remove, delete", async () => {
    const created = await projects.POST(
      send("POST", "", { id: P, name: "  My scene  " }),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      id: P,
      name: "My scene",
      role: "owner",
    });

    const list = await (await projects.GET(send("GET", ""))).json();
    expect(list).toMatchObject([{ id: P, role: "owner" }]);

    await db.projectMember.create({
      data: { projectId: P, userId: FRIEND, role: "viewer" },
    });
    const seen = await (
      await members.GET(send("GET", `/${P}/members`), ctx({ id: P }) as never)
    ).json();
    expect(seen).toHaveLength(2);

    const changed = await member.PATCH(
      send("PATCH", `/${P}/members/${FRIEND}`, { role: "editor" }),
      ctx({ id: P, userId: FRIEND }) as never,
    );
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ userId: FRIEND, role: "editor" });

    // The friend is not the owner: may not change roles, may leave
    signedIn = user(FRIEND);
    const denied = await member.PATCH(
      send("PATCH", `/${P}/members/${ME}`, { role: "viewer" }),
      ctx({ id: P, userId: ME }) as never,
    );
    expect(denied.status).toBe(403);
    const mineAsFriend = await (
      await one.GET(send("GET", `/${P}`), ctx({ id: P }) as never)
    ).json();
    expect(mineAsFriend.role).toBe("editor");

    signedIn = user(ME);
    expect(
      (
        await member.DELETE(
          send("DELETE", `/${P}/members/${FRIEND}`),
          ctx({ id: P, userId: FRIEND }) as never,
        )
      ).status,
    ).toBe(200);
    expect(
      (await one.DELETE(send("DELETE", `/${P}`), ctx({ id: P }) as never))
        .status,
    ).toBe(200);
    expect(await db.project.count({ where: { id: P } })).toBe(0);
  });
});

describeDb("invitations through the routes", () => {
  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    new Request(`http://localhost:3000/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("every route that needs a person answers 401 without one; the preview needs nobody", async () => {
    signedIn = null;
    const token = "A".repeat(43);
    const answers = await Promise.all([
      invitations.GET(
        send("GET", `/${P}/invitations`),
        ctx({ id: P }) as never,
      ),
      invitations.POST(
        send("POST", `/${P}/invitations`, { role: "viewer" }),
        ctx({ id: P }) as never,
      ),
      invitation.DELETE(
        send(
          "DELETE",
          `/${P}/invitations/00000000-0000-4000-8000-000000000000`,
        ),
        ctx({
          id: P,
          invitationId: "00000000-0000-4000-8000-000000000000",
        }) as never,
      ),
      accept.POST(post("/invitations/accept", { token })),
    ]);
    expect(answers.map((a) => a.status)).toEqual([401, 401, 401, 401]);
    expect(
      (await preview.POST(post("/invitations/preview", { token }))).status,
    ).toBe(404);
  });

  it("refuses bodies that are not the right shape", async () => {
    await projects.POST(send("POST", "", { id: P, name: "x" }));
    for (const body of [
      { role: "owner" },
      { role: "admin" },
      { role: "viewer", days: 0 },
      { role: "viewer", days: 31 },
      {},
    ]) {
      const response = await invitations.POST(
        send("POST", `/${P}/invitations`, body),
        ctx({ id: P }) as never,
      );
      expect(response.status).toBe(400);
    }
    expect(
      (await accept.POST(post("/invitations/accept", { token: "short" })))
        .status,
    ).toBe(400);
    expect(
      (
        await preview.POST(
          post("/invitations/preview", {
            token: "has spaces and is not base64url!!!!!!!!!!!!!!!",
          }),
        )
      ).status,
    ).toBe(400);
    expect(await db.invitation.count({ where: { projectId: P } })).toBe(0);
  });

  it("invite, preview, join, and what the new member can and cannot do", async () => {
    await projects.POST(
      send("POST", "", { id: P, name: "Our scene", entrySceneId: "scene-a" }),
    );
    const made = await invitations.POST(
      send("POST", `/${P}/invitations`, { role: "editor", days: 3 }),
      ctx({ id: P }) as never,
    );
    expect(made.status).toBe(201);
    expect(made.headers.get("cache-control")).toBe("no-store");
    const { token, id } = await made.json();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const listed = await (
      await invitations.GET(
        send("GET", `/${P}/invitations`),
        ctx({ id: P }) as never,
      )
    ).json();
    expect(listed).toMatchObject([{ id, role: "editor", status: "pending" }]);
    expect(JSON.stringify(listed)).not.toContain(token);

    // Nobody is signed in on the invite page yet: it still says what the link is for
    signedIn = null;
    const seen = await preview.POST(post("/invitations/preview", { token }));
    expect(await seen.json()).toEqual({
      projectName: "Our scene",
      role: "editor",
    });

    // The friend signs in and accepts, then sees the project with their role and the scene to open
    signedIn = user(FRIEND);
    const joined = await accept.POST(
      post(
        "/invitations/accept",
        { token },
        { origin: "http://localhost:3000" },
      ),
    );
    expect(joined.status).toBe(200);
    expect(await joined.json()).toMatchObject({
      projectId: P,
      role: "editor",
      entrySceneId: "scene-a",
      alreadyMember: false,
    });
    const mine = await (await projects.GET(send("GET", ""))).json();
    expect(mine).toMatchObject([
      { id: P, role: "editor", entrySceneId: "scene-a" },
    ]);

    // An editor may not invite, and the same link is used up
    const denied = await invitations.POST(
      send("POST", `/${P}/invitations`, { role: "viewer" }),
      ctx({ id: P }) as never,
    );
    expect(denied.status).toBe(403);
    signedIn = user(ME);
    const again = await accept.POST(post("/invitations/accept", { token }));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({
      error: "This invitation was already used.",
    });
    expect(
      (
        await invitation.DELETE(
          send("DELETE", `/${P}/invitations/${id}`),
          ctx({ id: P, invitationId: id }) as never,
        )
      ).status,
    ).toBe(409);
  });

  it("an accept sent from another site is refused", async () => {
    const response = await accept.POST(
      post(
        "/invitations/accept",
        { token: "A".repeat(43) },
        { origin: "https://evil.example" },
      ),
    );
    expect(response.status).toBe(403);
  });
});

describeDb("cutting people off", () => {
  async function projectWithFriend(role: "viewer" | "editor" = "viewer") {
    await projects.POST(send("POST", "", { id: P, name: "x" }));
    await db.projectMember.create({
      data: { projectId: P, userId: FRIEND, role },
    });
  }

  it("removing a member, changing a role and deleting the project each tell the collab server", async () => {
    await projectWithFriend();
    await member.PATCH(
      send("PATCH", `/${P}/members/${FRIEND}`, { role: "editor" }),
      ctx({ id: P, userId: FRIEND }) as never,
    );
    expect(disconnected).toEqual([{ projectId: P, userId: FRIEND }]);
    await member.DELETE(
      send("DELETE", `/${P}/members/${FRIEND}`),
      ctx({ id: P, userId: FRIEND }) as never,
    );
    expect(disconnected.at(-1)).toEqual({ projectId: P, userId: FRIEND });
    await one.DELETE(send("DELETE", `/${P}`), ctx({ id: P }) as never);
    expect(disconnected.at(-1)).toEqual({ projectId: P });
    expect(disconnected).toHaveLength(3);
  });

  it("a person leaving on their own is disconnected too", async () => {
    await projectWithFriend();
    signedIn = user(FRIEND);
    await member.DELETE(
      send("DELETE", `/${P}/members/${FRIEND}`),
      ctx({ id: P, userId: FRIEND }) as never,
    );
    expect(disconnected).toEqual([{ projectId: P, userId: FRIEND }]);
  });

  it("a refused change disconnects nobody", async () => {
    await projectWithFriend("editor");
    signedIn = user(FRIEND);
    const denied = await member.PATCH(
      send("PATCH", `/${P}/members/${ME}`, { role: "viewer" }),
      ctx({ id: P, userId: ME }) as never,
    );
    expect(denied.status).toBe(403);
    expect(
      (
        await member.DELETE(
          send("DELETE", `/${P}/members/${ME}`),
          ctx({ id: P, userId: ME }) as never,
        )
      ).status,
    ).toBe(403);
    expect(
      (await one.DELETE(send("DELETE", `/${P}`), ctx({ id: P }) as never))
        .status,
    ).toBe(403);
    expect(disconnected).toEqual([]);
  });
});
