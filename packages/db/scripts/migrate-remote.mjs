// Builds the database tables on a REMOTE Postgres (Neon) from this computer, without the address ever being typed into a
// command or a chat: the address is read from the file `packages/db/.env.remote`, which git ignores.
//
//   pnpm --filter @sceneroom/db migrate:remote
//
// The file needs one line:  DATABASE_URL=<the DIRECT (not pooled) connection string of the Neon project>
// Migrations need the direct address: the pooled one goes through a connection pooler that can hang `prisma migrate`.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "..", ".env.remote");
if (!existsSync(file)) {
  console.error(
    "packages/db/.env.remote does not exist. Create it with one line: DATABASE_URL=<the direct connection string>.",
  );
  process.exit(1);
}
const url = parseEnv(readFileSync(file, "utf8")).DATABASE_URL;
if (!url) {
  console.error("packages/db/.env.remote has no DATABASE_URL line.");
  process.exit(1);
}
let target;
try {
  target = new URL(url);
} catch {
  console.error("DATABASE_URL in .env.remote is not a valid address.");
  process.exit(1);
}
if (target.hostname === "127.0.0.1" || target.hostname === "localhost") {
  console.error(
    "That address is this computer, not a remote database. Use `migrate:deploy` for the local one.",
  );
  process.exit(1);
}
if (target.hostname.includes("-pooler")) {
  console.error(
    "That is the POOLED address (its host has -pooler). Use the direct one for migrations: in Neon's Connect dialog turn the pooled option off.",
  );
  process.exit(1);
}
// Shown without the password, so you can check it is the right database
console.log(
  `Migrating ${target.hostname}${target.pathname} as ${target.username}`,
);

const run = (args) =>
  spawnSync("pnpm", ["exec", "prisma", ...args], {
    cwd: join(here, ".."),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
const deploy = run(["migrate", "deploy"]);
if (deploy.status !== 0) process.exit(deploy.status ?? 1);
const status = run(["migrate", "status"]);
process.exit(status.status ?? 0);
