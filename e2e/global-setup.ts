import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { encryptSiteToken } from "../src/lib/crypto/siteToken";
import { loadEnvLocal, TEST_USER } from "./env";

// Seeds one fixed account so the a11y spec can log in as a real user and
// audit the authenticated screens, not just /login and /signup. Reuses this
// machine's own real Sanity project (same credentials `next dev` already
// loads from .env.local) rather than a mocked CmsAdapter, so Pages/Media
// Library/Dashboard render actual content instead of an empty state — when
// those credentials aren't present (e.g. a CI runner with no .env.local),
// the seeded user is simply left with zero Sites, and a11y.spec.ts skips the
// screens that need one.
export default async function globalSetup() {
  loadEnvLocal();

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email: TEST_USER.email },
      update: { passwordHash: await hashPassword(TEST_USER.password) },
      create: {
        email: TEST_USER.email,
        passwordHash: await hashPassword(TEST_USER.password),
      },
    });

    const { NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET, SANITY_API_TOKEN } = process.env;
    const hasSanityCredentials = Boolean(
      NEXT_PUBLIC_SANITY_PROJECT_ID && NEXT_PUBLIC_SANITY_DATASET && SANITY_API_TOKEN,
    );

    await prisma.site.deleteMany({ where: { userId: user.id } });
    if (hasSanityCredentials) {
      await prisma.site.create({
        data: {
          userId: user.id,
          name: "Accessibility audit (e2e)",
          cms: "sanity",
          sanityProjectId: NEXT_PUBLIC_SANITY_PROJECT_ID,
          sanityDataset: NEXT_PUBLIC_SANITY_DATASET,
          sanityTokenCiphertext: encryptSiteToken(SANITY_API_TOKEN!),
        },
      });
    }

    process.env.E2E_HAS_SITE = hasSanityCredentials ? "1" : "0";
  } finally {
    await prisma.$disconnect();
  }
}
