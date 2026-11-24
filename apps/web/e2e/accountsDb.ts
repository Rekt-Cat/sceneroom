import { Client } from "pg";

/**
 * The accounts database as the account tests need it: plain SQL through `pg` (the tests run outside Next, and the
 * generated Prisma client is an ES module that Playwright's loader cannot read). Development database only.
 */
const URL = "postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom";

export type TestRole = "owner" | "editor" | "commenter" | "viewer";

export async function withDb<T>(work: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: URL });
  await db.connect();
  try {
    return await work(db);
  } finally {
    await db.end();
  }
}

/** Removes everything made by the given test users (and their projects). */
export function cleanUsers(users: string[]): Promise<void> {
  return withDb(async (db) => {
    const projects = await db.query<{ id: string }>(
      'select id from project where "ownerId" = any($1)',
      [users],
    );
    const ids = projects.rows.map((row) => row.id);
    await db.query('delete from project_member where "projectId" = any($1)', [
      ids,
    ]);
    await db.query("delete from project where id = any($1)", [ids]);
    await db.query('delete from "user" where id = any($1)', [users]);
  });
}

export function ensureUser(id: string): Promise<void> {
  return withDb(async (db) => {
    await db.query(
      `insert into "user" (id, name, email, "updatedAt") values ($1, $1, $2, now()) on conflict (id) do nothing`,
      [id, `${id}@example.test`],
    );
  });
}

export function setMemberRole(
  projectId: string,
  userId: string,
  role: TestRole,
): Promise<void> {
  return withDb(async (db) => {
    await db.query(
      `insert into project_member ("projectId", "userId", role) values ($1, $2, $3::"Role")
       on conflict ("projectId", "userId") do update set role = excluded.role`,
      [projectId, userId, role],
    );
  });
}

export function removeMemberRow(
  projectId: string,
  userId: string,
): Promise<void> {
  return withDb(async (db) => {
    await db.query(
      'delete from project_member where "projectId" = $1 and "userId" = $2',
      [projectId, userId],
    );
  });
}

export function memberRoleOf(
  projectId: string,
  userId: string,
): Promise<TestRole | null> {
  return withDb(async (db) => {
    const result = await db.query<{ role: TestRole }>(
      'select role from project_member where "projectId" = $1 and "userId" = $2',
      [projectId, userId],
    );
    return result.rows[0]?.role ?? null;
  });
}
