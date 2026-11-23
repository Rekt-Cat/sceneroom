import { createDb } from "./client";

/**
 * Development data: two people and one shared project, so the dashboard and the members list have something to show
 * before real sign-in exists. Safe to run again (it overwrites the same rows).
 */
async function seed() {
  const db = createDb(process.env.DATABASE_URL);
  try {
    const alice = await db.user.upsert({
      where: { email: "alice@example.test" },
      update: {},
      create: {
        id: "seed-alice",
        name: "Alice (seed)",
        email: "alice@example.test",
      },
    });
    const bob = await db.user.upsert({
      where: { email: "bob@example.test" },
      update: {},
      create: { id: "seed-bob", name: "Bob (seed)", email: "bob@example.test" },
    });
    const project = await db.project.upsert({
      where: { id: "00000000-0000-4000-8000-000000000001" },
      update: {},
      create: {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Seed project",
        ownerId: alice.id,
      },
    });
    for (const [user, role] of [
      [alice, "owner"],
      [bob, "viewer"],
    ] as const) {
      await db.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: user.id } },
        update: { role },
        create: { projectId: project.id, userId: user.id, role },
      });
    }
    console.log("Seeded: Alice (owner) and Bob (viewer) in the seed project.");
  } finally {
    await db.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
});
