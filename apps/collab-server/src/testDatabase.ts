import { connect } from "node:net";

/**
 * Can something be reached at the database's address? Only asks the network (no login, no tables), so it is quick and
 * works without any client library.
 */
export function databaseReachable(
  url: string,
  timeoutMs = 800,
): Promise<boolean> {
  let host: string;
  let port: number;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    port = Number(parsed.port || 5432);
  } catch {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/**
 * (A copy of packages/db/src/testSupport.ts: the collab server does not depend on the database package.)
 *
 * For the tests that use the real Postgres of docker-compose.yml. On a computer where it is not running (Docker Desktop is
 * closed) they are skipped, with a warning that says how to start it, so a push from GitHub Desktop is not blocked by a
 * database that is simply off. In CI (the `CI` variable is set) they are never skipped: there the database must be there,
 * and a missing one is a failure.
 */
export async function shouldRunDatabaseTests(url: string): Promise<boolean> {
  if (process.env["CI"]) return true;
  if (await databaseReachable(url)) return true;
  const shown = url.replace(/\/\/[^@/]*@/, "//");
  console.warn(
    `\nPostgres is not reachable at ${shown}: the tests that need it are SKIPPED.\n` +
      "Start it with `docker compose up -d`, then `pnpm --filter @sceneroom/db migrate:deploy`.\n",
  );
  return false;
}
