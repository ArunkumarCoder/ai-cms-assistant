#!/usr/bin/env -S npx tsx
// `npm run seed:demo` (Day 36) — populates the connected WordPress staging
// site and this app's own Postgres database with a believable, fully-fake
// demo: a fictional small coffee roaster, 10 pages with deliberately varied
// quality, and several weeks of backfilled AI call-log history. See
// SPEC.md's "Demo dataset and seed script" section for the full design
// reasoning; this file is the orchestration layer — the logic worth testing
// in isolation lives in src/lib/seed/*.test.ts instead.
//
// Writes pages/FAQs/alt-text/status through the real CmsAdapter
// (WordPressAdapter, wrapped in withQualityScoring exactly like the live
// app's own resolveAdapter.ts does) and the real Prisma client — the one
// necessary exception is uploading new media attachments, which CmsAdapter
// has no method for at all (see src/lib/seed/wordpressMedia.ts's own
// comment for why).
import { PrismaClient } from "@prisma/client";
import { loadEnvLocal } from "./env";
import { checkSeedTargetSafety, redactTarget } from "../src/lib/seed/safety";
import { hashPassword } from "../src/lib/auth/password";
import { encryptSiteToken } from "../src/lib/crypto/siteToken";
import {
  FetchWordPressApiClient,
  WordPressAdapter,
} from "../src/lib/cms/wordpressAdapter";
import { withQualityScoring } from "../src/lib/quality/autoScore";
import { generatePlaceholderPng } from "../src/lib/seed/placeholderImage";
import {
  attachMediaToPost,
  findOrUploadDemoMedia,
} from "../src/lib/seed/wordpressMedia";
import {
  DEMO_PAGES,
  DEMO_IMAGE_COLORS,
  type DemoBlockDefinition,
} from "../src/lib/seed/demoContent";
import { upsertDemoFaqs, upsertDemoPage } from "../src/lib/seed/upsertPage";
import { buildDemoAiCallLogRows } from "../src/lib/seed/demoCallLog";
import {
  resolvePageStatusTransition,
  type PageStatusAction,
} from "../src/lib/pages/pageStatusTransitions";
import { DEMO_USER_EMAIL, DEMO_USER_PASSWORD } from "../src/lib/demoAccount";
import type { ContentBlock, PageStatus } from "../src/types";

loadEnvLocal();
const DEMO_SITE_NAME = "Larkspur Coffee Roasters (Demo)";

const STATUS_ACTION_PATH: Record<PageStatus, PageStatusAction[]> = {
  draft: [],
  "in-review": ["submit"],
  approved: ["submit", "approve"],
  published: ["submit", "approve", "publish"],
};

function parseArgs(argv: string[]) {
  return {
    reset: argv.includes("--reset"),
    forceNotProd: argv.includes("--i-know-this-is-not-prod"),
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing required env var ${name} — set it in .env.local before running the demo seed.`,
    );
    process.exit(1);
  }
  return value;
}

function daysAgo(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - days);
  return d;
}

function toContentBlocks(
  blocks: DemoBlockDefinition[],
  mediaIds: Map<string, string>,
): ContentBlock[] {
  return blocks.map((block, index) => {
    const id = `${block.type}-${index}`;
    if (block.type === "heading") {
      return {
        id,
        type: "heading",
        order: index,
        content: block.content,
        metadata: { level: block.level },
      };
    }
    if (block.type === "paragraph") {
      return {
        id,
        type: "paragraph",
        order: index,
        content: block.content,
        metadata: block.style ? { style: block.style } : undefined,
      };
    }
    if (block.type === "cta") {
      return {
        id,
        type: "cta",
        order: index,
        content: block.content,
        metadata: { href: block.href },
      };
    }
    const assetId = mediaIds.get(block.colorKey);
    if (!assetId)
      throw new Error(
        `No uploaded media found for colorKey "${block.colorKey}" — upload step ran out of order.`,
      );
    return {
      id,
      type: "image",
      order: index,
      // A null altText (the task's deliberate "missing alt text" pages)
      // becomes an empty string here, not a placeholder string — an empty
      // alt is what actually reads as "missing" to the rest of the app
      // (assessAltText, the alt-text-status derivation), same as any real
      // image nobody has captioned yet.
      content: block.altText ?? "",
      metadata: { assetId },
    };
  });
}

async function uploadDemoImages(
  baseUrl: string,
  authHeader: string,
): Promise<Map<string, string>> {
  const mediaIds = new Map<string, string>();
  for (const [colorKey, spec] of Object.entries(DEMO_IMAGE_COLORS)) {
    const png = generatePlaceholderPng(640, 360, spec.color, spec.stripeColor);
    const assetId = await findOrUploadDemoMedia({
      baseUrl,
      authHeader,
      title: spec.title,
      filename: `${colorKey}.png`,
      pngBuffer: png,
    });
    mediaIds.set(colorKey, assetId);
    console.log(`  image "${spec.title}" -> attachment #${assetId}`);
  }
  return mediaIds;
}

async function main() {
  const { reset, forceNotProd } = parseArgs(process.argv.slice(2));

  const databaseUrl = requireEnv("DATABASE_URL");
  const wordpressUrl = requireEnv("WORDPRESS_STAGING_URL");
  const wordpressUsername = requireEnv("WORDPRESS_STAGING_USERNAME");
  const wordpressAppPassword = requireEnv(
    "WORDPRESS_STAGING_APPLICATION_PASSWORD",
  );
  requireEnv("SITE_TOKEN_ENCRYPTION_KEY");

  console.log("This will touch:");
  console.log(`  Database:        ${redactTarget(databaseUrl)}`);
  console.log(
    `  WordPress site:  ${wordpressUrl}  (user: ${wordpressUsername})`,
  );
  console.log(`  Demo account:    ${DEMO_USER_EMAIL}`);
  console.log(
    reset
      ? "  Mode:            RESET (wipes existing demo data first) + re-seed"
      : "  Mode:            seed (idempotent upsert)",
  );
  console.log("");

  const safety = checkSeedTargetSafety(
    [
      { label: "Database", value: databaseUrl },
      { label: "WordPress site", value: wordpressUrl },
    ],
    forceNotProd,
  );
  if (!safety.safe) {
    console.error(
      "Refusing to run — this doesn't look like an obviously local/staging/demo target:",
    );
    for (const reason of safety.reasons) console.error(`  - ${reason}`);
    console.error(
      "\nIf you're sure this is safe, re-run with --i-know-this-is-not-prod.",
    );
    process.exit(1);
  }
  if (safety.reasons.length > 0) {
    console.warn("Proceeding despite --i-know-this-is-not-prod flagging:");
    for (const reason of safety.reasons) console.warn(`  - ${reason}`);
  }

  const prisma = new PrismaClient();
  try {
    if (reset) {
      const existing = await prisma.user.findUnique({
        where: { email: DEMO_USER_EMAIL },
        include: { sites: true },
      });
      if (existing) {
        for (const site of existing.sites) {
          // AiCallLog/PageAuditLogEntry/QualityScoreHistory are deliberately
          // *not* cascade-linked to Site (SPEC.md §20's own design note:
          // historical cost/audit data shouldn't vanish just because a Site
          // is removed) — deleted explicitly here instead, scoped to this
          // one demo Site's id only.
          await prisma.aiCallLog.deleteMany({ where: { siteId: site.id } });
          await prisma.pageAuditLogEntry.deleteMany({
            where: { siteId: site.id },
          });
          await prisma.qualityScoreHistory.deleteMany({
            where: { siteId: site.id },
          });
        }
        await prisma.user.delete({ where: { id: existing.id } }); // cascades Site
        console.log(
          `Reset: removed demo user, ${existing.sites.length} Site(s), and their logged history.\n`,
        );
      } else {
        console.log(
          "Reset: no existing demo user found — nothing to remove.\n",
        );
      }
    }

    const user = await prisma.user.upsert({
      where: { email: DEMO_USER_EMAIL },
      update: { passwordHash: await hashPassword(DEMO_USER_PASSWORD) },
      create: {
        email: DEMO_USER_EMAIL,
        passwordHash: await hashPassword(DEMO_USER_PASSWORD),
      },
    });

    let site = await prisma.site.findFirst({
      where: { userId: user.id, cms: "wordpress" },
    });
    const siteData = {
      name: DEMO_SITE_NAME,
      cms: "wordpress" as const,
      wordpressUrl,
      wordpressUsername,
      wordpressAppPasswordCiphertext: encryptSiteToken(wordpressAppPassword),
    };
    site = site
      ? await prisma.site.update({ where: { id: site.id }, data: siteData })
      : await prisma.site.create({ data: { ...siteData, userId: user.id } });

    console.log(`Demo user: ${user.email} (${user.id})`);
    console.log(`Demo site: ${site.name} (${site.id})\n`);

    const client = new FetchWordPressApiClient(
      wordpressUrl,
      wordpressUsername,
      wordpressAppPassword,
    );
    const domainSite = {
      id: site.id,
      userId: user.id,
      name: site.name,
      cms: "wordpress" as const,
      wordpressUrl,
      wordpressUsername,
      createdAt: site.createdAt.toISOString(),
      updatedAt: site.updatedAt.toISOString(),
    };
    const adapter = withQualityScoring(
      new WordPressAdapter(domainSite, client),
      { siteId: site.id },
    );

    console.log("Uploading placeholder images (idempotent by title)...");
    const authHeader = `Basic ${Buffer.from(`${wordpressUsername}:${wordpressAppPassword}`).toString("base64")}`;
    const mediaIds = await uploadDemoImages(wordpressUrl, authHeader);
    console.log("");

    const now = new Date();
    let createdCount = 0;
    let updatedCount = 0;

    for (const def of DEMO_PAGES) {
      const contentBlocks = toContentBlocks(def.blocks, mediaIds);
      const { page, created } = await upsertDemoPage(adapter, {
        slug: def.slug,
        title: def.title,
        metaDescription: def.metaDescription,
        targetKeyword: def.targetKeyword,
        pageType: def.pageType,
        contentBlocks,
      });
      if (created) createdCount++;
      else updatedCount++;
      const cmsDocumentId = page.cmsDocumentId ?? page.id;

      // Alt-text review status lives on the WordPress *attachment*, not on
      // the page content block referencing it (wordpressAdapter.ts's own
      // `resolveImageAltStatuses` note) — setting it explicitly through the
      // real adapter.updateImage(), the same write the Media Library's
      // "Accept" button makes, rather than leaving it to whatever an
      // untouched attachment's fallback derivation produces. This is the
      // one thing that actually makes the task's "2 pages with images
      // missing alt text" land on the *specific* two pages, not an
      // arbitrary subset decided by a fallback heuristic.
      for (const block of def.blocks) {
        if (block.type !== "image") continue;
        const assetId = mediaIds.get(block.colorKey);
        if (!assetId) continue;
        await adapter.updateImage(assetId, {
          altText: block.altText,
          altTextStatus: block.altText === null ? "missing" : "reviewed",
        });
        // See wordpressMedia.ts's own comment: this is what makes the Media
        // Library's "used on <page>" link resolve at all, instead of every
        // image reading as "used on an unknown page."
        await attachMediaToPost(
          wordpressUrl,
          authHeader,
          assetId,
          cmsDocumentId,
        );
      }

      if (def.faqs && def.faqs.length > 0) {
        await upsertDemoFaqs(
          adapter,
          cmsDocumentId,
          def.faqs.map((faq, i) => ({
            id: `demo-faq-${def.slug}-${i}`,
            question: faq.question,
            answer: faq.answer,
            order: i,
            source: "manual" as const,
          })),
          page.id,
        );
      }

      const actions = STATUS_ACTION_PATH[def.status];
      let current: PageStatus = "draft";
      for (const [stepIndex, action] of actions.entries()) {
        const next = resolvePageStatusTransition(action, current);
        if (!next)
          throw new Error(
            `Illegal transition "${action}" from "${current}" for ${def.slug} — check STATUS_ACTION_PATH.`,
          );
        await adapter.updatePage(cmsDocumentId, { status: next });
        const occurredAt = daysAgo(now, (actions.length - stepIndex) * 4 - 2);
        await prisma.pageAuditLogEntry.upsert({
          where: { id: `demo-audit-${def.slug}-${stepIndex}` },
          update: {},
          create: {
            id: `demo-audit-${def.slug}-${stepIndex}`,
            pageId: cmsDocumentId,
            siteId: site.id,
            userId: user.id,
            userEmail: user.email,
            action: "status-changed",
            summary: `Status changed: ${current} → ${next}.`,
            metadata: { from: current, to: next, transitionAction: action },
            createdAt: occurredAt,
          },
        });
        current = next;
      }

      console.log(
        `  ${created ? "created" : "updated"}: ${def.slug} (${def.status})`,
      );
    }
    console.log(`\nPages: ${createdCount} created, ${updatedCount} updated.\n`);

    console.log("Backfilling AI call-log history...");
    const callLogRows = buildDemoAiCallLogRows(now, site.id, user.id);
    for (const row of callLogRows) {
      await prisma.aiCallLog.upsert({
        where: { id: row.id },
        update: {},
        create: row,
      });
    }
    console.log(
      `  ${callLogRows.length} call-log rows (idempotent — re-running never adds more).\n`,
    );

    console.log("Done. Log in at http://localhost:3000/login with:");
    console.log(`  Email:    ${DEMO_USER_EMAIL}`);
    console.log(`  Password: ${DEMO_USER_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
