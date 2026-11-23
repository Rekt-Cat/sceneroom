import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

/** The address of the Docker database from docker-compose.yml (throwaway local credentials). */
export const DEFAULT_DATABASE_URL =
  "postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom";

/** A database client. Pass `DATABASE_URL`'s value; without one the local Docker database is used. */
export function createDb(url: string = DEFAULT_DATABASE_URL): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export type Db = PrismaClient;
