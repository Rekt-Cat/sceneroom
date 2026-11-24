import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@sceneroom/db";
import type { CurrentUser } from "@/server/session";

// Sign-in itself is tested elsewhere (it needs GitHub); here the signed-in person is faked. Everything else is real:
// the routes, the checks and the Postgres of docker-compose.yml.
let signedIn: CurrentUser | null = null;
vi.mock("@/server/session", () => ({ getCurrentUser: async () => signedIn }));

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

beforeEach(async () => {
  await clean();
  for (const id of [ME, FRIEND]) {
    await db.user.create({
      data: { id, name: id, email: `${id}@example.test` },
    });
  }
  signedIn = user(ME);
});
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

describe("who may call", () => {
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
    ]);
    expect(answers.map((a) => a.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401,
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

describe("what is accepted", () => {
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

describe("the whole journey through the routes", () => {
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
