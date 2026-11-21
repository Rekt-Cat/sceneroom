import { z } from "zod";

/** An id inside a document name: letters, digits, "-" and "_" only, so a name can never smuggle in a separator. */
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const projectIdSchema = idSchema;

/**
 * What a document name looks like (docs/backend/COLLABORATION.md, section 4):
 * "project:<projectId>" for the project document, "scene:<projectId>:<sceneId>" for one scene.
 */
export type DocumentName =
  | { kind: "project"; projectId: string }
  | { kind: "scene"; projectId: string; sceneId: string };

/** Reads a document name sent by a client. null if it is not one of the two shapes. */
export function parseDocumentName(name: string): DocumentName | null {
  const parts = name.split(":");
  if (parts[0] === "project" && parts.length === 2) {
    const projectId = idSchema.safeParse(parts[1]);
    return projectId.success
      ? { kind: "project", projectId: projectId.data }
      : null;
  }
  if (parts[0] === "scene" && parts.length === 3) {
    const projectId = idSchema.safeParse(parts[1]);
    const sceneId = idSchema.safeParse(parts[2]);
    return projectId.success && sceneId.success
      ? { kind: "scene", projectId: projectId.data, sceneId: sceneId.data }
      : null;
  }
  return null;
}
