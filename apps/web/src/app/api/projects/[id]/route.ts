import { projectIdSchema } from "@/server/projectSchemas";
import { deleteProject, getProject } from "@/server/projects";
import { notFound, respond, withUser } from "@/server/routeHelpers";

export const runtime = "nodejs";

/** One project and my role in it. */
export function GET(
  request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  return withUser(request, async ({ db, user }) => {
    const id = projectIdSchema.safeParse((await context.params).id);
    if (!id.success) return notFound();
    return respond(await getProject(db, user, id.data));
  });
}

/** Deletes the project (owner only). */
export function DELETE(
  request: Request,
  context: RouteContext<"/api/projects/[id]">,
) {
  return withUser(request, async ({ db, user }) => {
    const id = projectIdSchema.safeParse((await context.params).id);
    if (!id.success) return notFound();
    return respond(await deleteProject(db, user, id.data));
  });
}
