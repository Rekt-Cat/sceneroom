import {
  createLinkToken,
  LINK_ROLES,
  type LinkRole,
} from "@sceneroom/link-token";
import { loadConfig } from "./config";

/** Prints a link token, for trying the server by hand: `pnpm --filter @sceneroom/collab-server make-token <projectId> <editor|viewer>` */
const [projectId, role] = process.argv.slice(2);
const isRole = (value: string | undefined): value is LinkRole =>
  LINK_ROLES.some((r) => r === value);
if (!projectId || !isRole(role)) {
  console.error("Usage: make-token <projectId> <editor|viewer>");
  process.exit(1);
}
const { secret } = loadConfig(process.env);
console.log(createLinkToken({ projectId, role }, secret));
