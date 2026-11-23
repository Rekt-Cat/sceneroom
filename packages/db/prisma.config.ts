import { defineConfig } from "prisma/config";

// Prisma 7 reads the database address here, not in schema.prisma. The default is the Docker database of
// docker-compose.yml (throwaway local credentials); a real deployment sets DATABASE_URL.
const DEFAULT_URL = "postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx src/seed.ts" },
  datasource: { url: process.env.DATABASE_URL ?? DEFAULT_URL },
});
