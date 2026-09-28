import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentBlocks } from "@/components/ContentBlocks";
import { FaqEditor } from "@/components/FaqEditor";
import { SeoPanel } from "@/components/SeoPanel";
import { getAdapterForCurrentUser, NoSiteConnectedError } from "@/lib/cms";
import { buildFaqPageJsonLd, serializeJsonLd } from "@/lib/faq";
import type { Page } from "@/types";

async function getPage(
  slug: string,
): Promise<{ page: Page | null; error: string | null }> {
  try {
    const adapter = await getAdapterForCurrentUser();
    const page = await adapter.getPage(slug);
    return { page, error: null };
  } catch (err) {
    if (err instanceof NoSiteConnectedError) {
      redirect("/sites");
    }
    console.error(`Failed to fetch page "${slug}" from Sanity:`, err);
    return {
      page: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default async function PageDetailRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { page, error } = await getPage(slug);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <Link href="/pages" className="text-sm text-zinc-500 hover:underline">
          ← Back to pages
        </Link>
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">
            Couldn&apos;t load this page from Sanity.
          </p>
          <p className="mt-1 text-sm opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  if (!page) {
    notFound();
  }

  // Derived from `page.faqItems` — the persisted data this Server Component
  // just fetched — never from FaqEditor's local draft state, so a generated
  // but not-yet-saved FAQ can't leak into live structured data (SPEC.md
  // §15's "never auto-published" carries over here). No caching anywhere in
  // this route (§5) means this recomputes fresh on every request, so it's
  // automatically back in sync the moment FaqEditor's "Save FAQs" triggers
  // router.refresh() — no separate invalidation to wire up.
  const faqPageJsonLd = buildFaqPageJsonLd(page.faqItems);

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-16">
      {faqPageJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqPageJsonLd) }}
        />
      )}

      <Link href="/pages" className="text-sm text-zinc-500 hover:underline">
        ← Back to pages
      </Link>

      <header className="mt-6">
        <h1 className="text-3xl font-semibold tracking-tight">{page.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="capitalize">{page.pageType}</span>
          <span>·</span>
          <span className="capitalize">{page.status}</span>
          {typeof page.qualityScore === "number" && (
            <>
              <span>·</span>
              <span>Quality score: {page.qualityScore}/100</span>
            </>
          )}
        </div>
      </header>

      <div className="mt-6">
        <SeoPanel page={page} />
      </div>

      <div id="page-content-blocks" className="mt-8">
        {page.contentBlocks.length > 0 ? (
          <ContentBlocks blocks={page.contentBlocks} />
        ) : (
          <p className="text-zinc-500 dark:text-zinc-400">
            This page has no body content yet.
          </p>
        )}
      </div>

      <FaqEditor page={page} />
    </article>
  );
}
