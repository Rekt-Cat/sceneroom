/**
 * The address to send to someone: the editor for the project, with the server, the link token and the scene to open (a
 * browser that does not have the project yet makes it for that scene, see startPersistence.ts).
 */
export function buildShareLink(options: {
  origin: string;
  projectId: string;
  url: string;
  token: string;
  sceneId: string;
}): string {
  const query = new URLSearchParams({
    collab: options.url,
    token: options.token,
    scene: options.sceneId,
  });
  return `${options.origin}/p/${options.projectId}?${query.toString()}`;
}
