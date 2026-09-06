import Link from "next/link";
import { getAdapterForCurrentUser, NoSiteConnectedError } from "@/lib/cms";
import type { PageSummary } from "@/lib/cms";
import { requireUser } from "@/lib/auth/dal";
import { logoutAction } from "@/lib/auth/actions";

export const metadata = { title: "Pages" };

type PagesResult =
  | { kind: "ok"; pages: PageSummary[] }
  | { kind: "no-site" }
  | { kind: "error"; message: string };

async function getPages(): Promise<PagesResult> {
  try {
    const adapter = await getAdapterForCurrentUser();
    return { kind: "ok", pages: await adapter.getPages() };
  } catch (err) {
    if (err instanceof NoSiteConnectedError) {
      return { kind: "no-site" };
    }
    console.error("Failed to fetch pages from Sanity:", err);
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "in-review":
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  published:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export default async function PagesIndex() {
  const user = await requireUser();
  const result = await getPages();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pages</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Live from Sanity — project content, not mock data.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4 pt-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">{user.email}</span>
          <form action={logoutAction}>
            <button type="submit" className="underline hover:opacity-80">
              Log out
            </button>
          </form>
        </div>
      </div>

      {result.kind === "no-site" && (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">
            No Sanity project connected to your account yet.
          </p>
          <Link
            href="/sites/connect"
            className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Connect a Sanity project
          </Link>
        </div>
      )}

      {result.kind === "error" && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">Couldn&apos;t load pages from Sanity.</p>
          <p className="mt-1 text-sm opacity-80">{result.message}</p>
        </div>
      )}

      {result.kind === "ok" && result.pages.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No pages yet. Add one in Sanity Studio to see it here.
        </div>
      )}

      {result.kind === "ok" && result.pages.length > 0 && (
        <ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">
          {result.pages.map((page) => (
            <li key={page.id} className="py-5">
              <Link
                href={`/pages/${page.slug}`}
                className="flex items-start justify-between gap-4 hover:opacity-80"
              >
                <div>
                  <h2 className="text-lg font-medium">{page.title}</h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {page.pageType}
                    {page.targetKeyword
                      ? ` · targeting "${page.targetKeyword}"`
                      : ""}
                    {page.faqCount > 0
                      ? ` · ${page.faqCount} FAQ${page.faqCount === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {typeof page.qualityScore === "number" && (
                    <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                      {page.qualityScore}/100
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      STATUS_STYLES[page.status] ?? STATUS_STYLES.draft
                    }`}
                  >
                    {page.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
