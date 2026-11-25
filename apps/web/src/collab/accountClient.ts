import { z } from "zod";

const errorSchema = z.object({ error: z.string() });

/**
 * Puts a project online with the signed-in person as its owner (`POST /api/projects`). Safe to repeat for the same
 * project. Throws an Error with a message for the person when the web app says no.
 */
export async function putProjectOnline(
  projectId: string,
  name: string,
  entrySceneId: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<void> {
  const response = await fetchImpl("/api/projects", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: projectId, name, entrySceneId }),
  });
  if (response.ok) return;
  const body = errorSchema.safeParse(await response.json().catch(() => null));
  throw new Error(
    body.success
      ? body.data.error
      : `The server could not put the project online (${response.status}).`,
  );
}

const meSchema = z.object({ id: z.string(), name: z.string() });

/** Who is signed in, or null (nobody, accounts not set up, or the web app cannot be reached). */
export async function fetchMe(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<{ id: string; name: string } | null> {
  try {
    const response = await fetchImpl("/api/me", { credentials: "same-origin" });
    if (!response.ok) return null;
    const parsed = meSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn("Could not ask who is signed in:", error);
    return null;
  }
}

// ---- Projects, members and invitations (the routes of step M8c and M8e). Every answer is checked: it comes over the network.

const roleSchema = z.enum(["owner", "editor", "commenter", "viewer"]);
export type Role = z.infer<typeof roleSchema>;
export type MemberRole = Exclude<Role, "owner">;
export const MEMBER_ROLES: readonly MemberRole[] = [
  "editor",
  "commenter",
  "viewer",
];

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: roleSchema,
  entrySceneId: z.string().nullable(),
});
export type OnlineProject = z.infer<typeof projectSchema>;

const memberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: roleSchema,
});
export type Member = z.infer<typeof memberSchema>;

const invitationSchema = z.object({
  id: z.string(),
  role: roleSchema,
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.string(),
  acceptedBy: z.string().nullable(),
});
export type Invitation = z.infer<typeof invitationSchema>;

const createdInvitationSchema = z.object({
  id: z.string(),
  token: z.string(),
  role: roleSchema,
  expiresAt: z.string(),
});

type Call = typeof fetch;
const defaultCall: Call = (...args) => fetch(...args);

/** Calls a route and returns its JSON, or throws an Error with the server's own words (or a plain one). */
async function request<T>(
  schema: z.ZodType<T>,
  path: string,
  init: { method?: string; body?: unknown } = {},
  call: Call = defaultCall,
): Promise<T> {
  const response = await call(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    ...(init.body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(init.body),
        }),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorSchema.safeParse(data);
    throw new Error(
      failure.success
        ? failure.data.error
        : `The server answered ${response.status}.`,
    );
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new Error("The server's answer was not understood.");
  return parsed.data;
}

export const listMyProjects = (call?: Call) =>
  request(z.array(projectSchema), "/api/projects", {}, call);

export const getProject = (projectId: string, call?: Call) =>
  request(projectSchema, `/api/projects/${projectId}`, {}, call);

export const listMembers = (projectId: string, call?: Call) =>
  request(
    z.array(memberSchema),
    `/api/projects/${projectId}/members`,
    {},
    call,
  );

export const changeMemberRole = (
  projectId: string,
  userId: string,
  role: MemberRole,
  call?: Call,
) =>
  request(
    z.object({ userId: z.string(), role: roleSchema }),
    `/api/projects/${projectId}/members/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: { role } },
    call,
  );

export const removeMember = (projectId: string, userId: string, call?: Call) =>
  request(
    z.object({ userId: z.string() }),
    `/api/projects/${projectId}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
    call,
  );

export const listInvitations = (projectId: string, call?: Call) =>
  request(
    z.array(invitationSchema),
    `/api/projects/${projectId}/invitations`,
    {},
    call,
  );

export const createInvitation = (
  projectId: string,
  role: MemberRole,
  days: number,
  call?: Call,
) =>
  request(
    createdInvitationSchema,
    `/api/projects/${projectId}/invitations`,
    { method: "POST", body: { role, days } },
    call,
  );

export const revokeInvitation = (
  projectId: string,
  invitationId: string,
  call?: Call,
) =>
  request(
    z.object({ id: z.string() }),
    `/api/projects/${projectId}/invitations/${invitationId}`,
    { method: "DELETE" },
    call,
  );

export const previewInvitation = (token: string, call?: Call) =>
  request(
    z.object({ projectName: z.string(), role: roleSchema }),
    "/api/invitations/preview",
    { method: "POST", body: { token } },
    call,
  );

const acceptedSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  role: roleSchema,
  entrySceneId: z.string().nullable(),
  alreadyMember: z.boolean(),
});
export type Accepted = z.infer<typeof acceptedSchema>;

export const acceptInvitation = (token: string, call?: Call) =>
  request(
    acceptedSchema,
    "/api/invitations/accept",
    { method: "POST", body: { token } },
    call,
  );

/** The address that opens an online project in the editor with the person's account. */
export function onlineProjectAddress(project: {
  id: string;
  entrySceneId: string | null;
}): string {
  const query = new URLSearchParams({ online: "account" });
  if (project.entrySceneId) query.set("scene", project.entrySceneId);
  return `/p/${project.id}?${query.toString()}`;
}
