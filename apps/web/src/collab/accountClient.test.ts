import { describe, expect, it, vi } from "vitest";
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  fetchMe,
  listInvitations,
  listMembers,
  listMyProjects,
  onlineProjectAddress,
  previewInvitation,
  putProjectOnline,
  removeMember,
  revokeInvitation,
} from "./accountClient";

describe("putProjectOnline", () => {
  it("sends the id and name to /api/projects", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 201 }));
    await putProjectOnline("p1", "My project", "scene-1", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/api/projects", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "p1",
        name: "My project",
        entrySceneId: "scene-1",
      }),
    });
  });

  it("throws the server's own words when it says no", async () => {
    const no = async () =>
      new Response(JSON.stringify({ error: "Sign in first." }), {
        status: 401,
      });
    await expect(putProjectOnline("p", "n", "s", no)).rejects.toThrow(
      "Sign in first.",
    );
  });

  it("throws a plain message when the answer is not understood", async () => {
    const odd = async () => new Response("<html>", { status: 502 });
    await expect(putProjectOnline("p", "n", "s", odd)).rejects.toThrow(/502/);
  });
});

describe("fetchMe", () => {
  it("returns the signed-in person", async () => {
    const ok = async () =>
      new Response(JSON.stringify({ id: "u1", name: "Ada", image: null }));
    expect(await fetchMe(ok)).toEqual({ id: "u1", name: "Ada" });
  });

  it("is null when signed out, when accounts are off, when the answer is odd, or when the call fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      await fetchMe(async () => new Response("{}", { status: 401 })),
    ).toBeNull();
    expect(
      await fetchMe(async () => new Response("{}", { status: 503 })),
    ).toBeNull();
    expect(
      await fetchMe(async () => new Response(JSON.stringify({ x: 1 }))),
    ).toBeNull();
    expect(
      await fetchMe(async () => Promise.reject(new Error("offline"))),
    ).toBeNull();
  });
});

const answer =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status });

describe("projects, members and invitations", () => {
  it("reads lists and checks their shape", async () => {
    const project = {
      id: "p",
      name: "N",
      role: "editor",
      entrySceneId: "s",
      createdAt: "x",
    };
    expect(await listMyProjects(answer([project]))).toEqual([
      { id: "p", name: "N", role: "editor", entrySceneId: "s" },
    ]);
    const member = {
      userId: "u",
      name: "Ann",
      email: null,
      role: "viewer",
      addedAt: "x",
    };
    expect(await listMembers("p", answer([member]))).toEqual([
      { userId: "u", name: "Ann", email: null, role: "viewer" },
    ]);
    await expect(listMembers("p", answer([{ userId: 5 }]))).rejects.toThrow(
      /not understood/,
    );
  });

  it("sends the right method, path and body", async () => {
    const calls: [string, RequestInit][] = [];
    const call = async (path: unknown, init?: RequestInit) => {
      calls.push([String(path), init!]);
      return new Response(
        JSON.stringify({ userId: "a b", role: "editor", id: "i" }),
      );
    };
    await changeMemberRole("p", "a b", "editor", call as never);
    await removeMember("p", "a b", call as never);
    await revokeInvitation("p", "i", call as never);
    expect(calls.map(([path, init]) => `${init.method} ${path}`)).toEqual([
      "PATCH /api/projects/p/members/a%20b",
      "DELETE /api/projects/p/members/a%20b",
      "DELETE /api/projects/p/invitations/i",
    ]);
    expect(calls[0]![1].body).toBe('{"role":"editor"}');
  });

  it("creates and lists invitations; the secret comes with the creation only", async () => {
    const made = {
      id: "i",
      token: "T".repeat(43),
      role: "viewer",
      expiresAt: "2026-12-01",
    };
    expect(await createInvitation("p", "viewer", 7, answer(made, 201))).toEqual(
      made,
    );
    const listed = [
      {
        id: "i",
        role: "viewer",
        status: "pending",
        expiresAt: "x",
        acceptedBy: null,
        createdAt: "y",
      },
    ];
    const result = await listInvitations("p", answer(listed));
    expect(result[0]).not.toHaveProperty("token");
  });

  it("previews and accepts, and passes on the server's own words when it says no", async () => {
    expect(
      await previewInvitation(
        "T".repeat(43),
        answer({ projectName: "Our scene", role: "editor" }),
      ),
    ).toEqual({ projectName: "Our scene", role: "editor" });
    const accepted = {
      projectId: "p",
      projectName: "N",
      role: "editor",
      entrySceneId: "s",
      alreadyMember: false,
    };
    expect(await acceptInvitation("T".repeat(43), answer(accepted))).toEqual(
      accepted,
    );
    await expect(
      acceptInvitation(
        "T".repeat(43),
        answer({ error: "This invitation has expired." }, 409),
      ),
    ).rejects.toThrow("This invitation has expired.");
    await expect(
      previewInvitation(
        "T",
        async () => new Response("<html>", { status: 502 }),
      ),
    ).rejects.toThrow(/502/);
  });

  it("makes the address that opens an online project", () => {
    expect(onlineProjectAddress({ id: "p1", entrySceneId: "s1" })).toBe(
      "/p/p1?online=account&scene=s1",
    );
    expect(onlineProjectAddress({ id: "p1", entrySceneId: null })).toBe(
      "/p/p1?online=account",
    );
  });
});
