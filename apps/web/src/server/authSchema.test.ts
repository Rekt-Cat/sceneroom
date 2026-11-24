import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getAuthTables } from "better-auth/db";

// Better Auth needs these tables and columns. We wrote them by hand in packages/db/prisma/schema.prisma, so this test
// fails (and names the missing column) when a Better Auth upgrade asks for something the database does not have.
const schema = readFileSync(
  join(__dirname, "../../../../packages/db/prisma/schema.prisma"),
  "utf8",
);

function modelFor(table: string): string {
  const match = schema.match(
    new RegExp(`model \\w+ \\{([^}]*@@map\\("${table}"\\)[^}]*)\\}`),
  );
  if (!match) throw new Error(`No model mapped to table "${table}"`);
  return match[1];
}

describe("the database has what Better Auth needs", () => {
  const tables = getAuthTables({
    socialProviders: { github: { clientId: "x", clientSecret: "y" } },
  });
  for (const [key, table] of Object.entries(tables)) {
    it(`table ${key}: every column exists`, () => {
      const model = modelFor(table.modelName);
      const names = Object.entries(table.fields).map(
        ([name, field]) => (field as { fieldName?: string }).fieldName ?? name,
      );
      const missing = names.filter(
        (name) => !new RegExp(`^\\s*${name}\\s`, "m").test(model),
      );
      expect(missing).toEqual([]);
    });
  }
});
