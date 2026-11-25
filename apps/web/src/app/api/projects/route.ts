import { createProjectSchema } from "@/server/projectSchemas";
import { createProject, listMyProjects } from "@/server/projects";
import { readBody, respond, withUser } from "@/server/routeHelpers";

export const runtime = "nodejs";

/** The projects I am a member of. */
export function GET(request: Request) {
  return withUser(request, async ({ db, user }) =>
    Response.json(await listMyProjects(db, user)),
  );
}

/** Puts a project online with me as its owner: `{ id, name }`. */
export function POST(request: Request) {
  return withUser(request, async ({ db, user }) => {
    const body = await readBody(request, createProjectSchema);
    if (!body.ok) return body.response;
    const result = await createProject(db, user, body.data);
    return respond(result, 201);
  });
}
