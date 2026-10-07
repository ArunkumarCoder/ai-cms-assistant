import { PrismaClient } from "@prisma/client";
import { loadEnvLocal, TEST_USER } from "./env";

// Mirrors global-setup.ts — deletes the seeded account (Site cascades via
// the schema's onDelete: Cascade) so a local run never leaves the dev
// database with an extra user in it.
export default async function globalTeardown() {
  loadEnvLocal();
  const prisma = new PrismaClient();
  try {
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
  } finally {
    await prisma.$disconnect();
  }
}
