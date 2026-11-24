import { projectIdSchema } from "@/server/projectSchemas";
import { listMembers } from "@/server/projects";
import { notFound, respond, withUser } from "@/server/routeHelpers";

export const runtime = "nodejs";

/** Who is in the project (any member may ask). */
export function GET(
  request: Request,
  context: RouteContext<"/api/projects/[id]/members">,
) {
  return withUser(request, async ({ db, user }) => {
    const id = projectIdSchema.safeParse((await context.params).id);
    if (!id.success) return notFound();
    return respond(await listMembers(db, user, id.data));
  });
}
