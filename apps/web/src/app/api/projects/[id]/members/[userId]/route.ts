import {
  changeRoleSchema,
  projectIdSchema,
  userIdSchema,
} from "@/server/projectSchemas";
import { changeMemberRole, removeMember } from "@/server/projects";
import { notFound, readBody, respond, withUser } from "@/server/routeHelpers";

export const runtime = "nodejs";

type Context = RouteContext<"/api/projects/[id]/members/[userId]">;

async function readParams(context: Context) {
  const params = await context.params;
  const id = projectIdSchema.safeParse(params.id);
  const userId = userIdSchema.safeParse(params.userId);
  return id.success && userId.success
    ? { projectId: id.data, userId: userId.data }
    : null;
}

/** Changes a member's role: `{ role }` (owner only). */
export function PATCH(request: Request, context: Context) {
  return withUser(request, async ({ db, user }) => {
    const params = await readParams(context);
    if (!params) return notFound();
    const body = await readBody(request, changeRoleSchema);
    if (!body.ok) return body.response;
    return respond(
      await changeMemberRole(
        db,
        user,
        params.projectId,
        params.userId,
        body.data.role,
      ),
    );
  });
}

/** Removes a member (owner), or leaves the project (any member, for themself). */
export function DELETE(request: Request, context: Context) {
  return withUser(request, async ({ db, user }) => {
    const params = await readParams(context);
    if (!params) return notFound();
    return respond(
      await removeMember(db, user, params.projectId, params.userId),
    );
  });
}
