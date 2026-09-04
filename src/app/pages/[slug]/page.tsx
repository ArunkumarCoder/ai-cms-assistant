import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentBlocks } from "@/components/ContentBlocks";
import { defaultSanityAdapter } from "@/lib/cms";
import type { Page } from "@/types";

async function getPage(slug: string): Promise<{ page: Page | null; error: string | null }> {
  try {
    const page = await defaultSanityAdapter.getPage(slug);
    return { page, error: null };
  } catch (err) {
    console.error(`Failed to fetch page "${slug}" from Sanity:`, err);
    return { page: null, error: err instanceof Error ? err.message : "Unknown error" };
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
          <p className="font-medium">Couldn&apos;t load this page from Sanity.</p>
          <p className="mt-1 text-sm opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  if (!page) {
    notFound();
  }

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-16">
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

      <section className="mt-6 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <h2 className="font-medium text-zinc-700 dark:text-zinc-300">SEO</h2>
        {page.metaDescription ? (
          <dl className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
            <div>
              <dt className="inline font-medium">Meta description: </dt>
              <dd className="inline">{page.metaDescription}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-zinc-500 dark:text-zinc-500">No SEO fields filled in yet.</p>
        )}
      </section>

      <div className="mt-8">
        {page.contentBlocks.length > 0 ? (
          <ContentBlocks blocks={page.contentBlocks} />
        ) : (
          <p className="text-zinc-500 dark:text-zinc-400">This page has no body content yet.</p>
        )}
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">FAQs</h2>
        {page.faqItems.length > 0 ? (
          <dl className="mt-4 space-y-4">
            {page.faqItems.map((faq) => (
              <div
                key={faq.id}
                className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <dt className="font-medium">{faq.question}</dt>
                <dd className="mt-1 text-zinc-600 dark:text-zinc-400">{faq.answer}</dd>
                {faq.source === "ai-generated" && (
                  <p className="mt-2 text-xs text-zinc-400">AI-generated</p>
                )}
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-zinc-500 dark:text-zinc-400">No FAQs yet.</p>
        )}
      </section>
    </article>
  );
}
