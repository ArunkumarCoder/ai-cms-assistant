import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdapterForCurrentUser, NoSiteConnectedError } from "@/lib/cms";
import { assessAltText } from "@/lib/images";
import { MediaLibrary, type MediaLibraryItem } from "@/components/MediaLibrary";

export const metadata = { title: "Media" };

type MediaResult =
  | { kind: "ok"; items: MediaLibraryItem[]; filteredPageTitle: string | null }
  | { kind: "error"; message: string };

// Images have no standalone document type (SPEC.md §4) — CmsAdapter.listImages
// already hides the "actually a cross-page body scan" reality (§6), so this
// screen composes it with getPages() to resolve each image's usedOnPageIds
// into a real title/slug, entirely through the adapter — never a direct
// Sanity query, per this task's own instruction.
//
// `pageSlug` (from the dashboard's `?page=` link, SPEC.md §19) filters the
// list server-side to just that page's images — the Health Queue's
// "N images need alt text" reason links here instead of the generic /media,
// per that task's own "opens filtered to that page" requirement.
async function getMediaLibrary(pageSlug?: string): Promise<MediaResult> {
  try {
    const adapter = await getAdapterForCurrentUser();
    const [pages, images] = await Promise.all([adapter.getPages(), adapter.listImages()]);
    const pageById = new Map(pages.map((page) => [page.id, page]));

    const items: MediaLibraryItem[] = images
      .map((image) => {
        const usedOnPage = pageById.get(image.usedOnPageIds[0]);
        return {
          image,
          assessment: assessAltText(image),
          page: usedOnPage ? { title: usedOnPage.title, slug: usedOnPage.slug } : null,
        };
      })
      .filter((item) => !pageSlug || item.page?.slug === pageSlug);

    const filteredPageTitle = pageSlug
      ? (items[0]?.page?.title ?? pages.find((page) => page.slug === pageSlug)?.title ?? pageSlug)
      : null;

    return { kind: "ok", items, filteredPageTitle };
  } catch (err) {
    if (err instanceof NoSiteConnectedError) {
      redirect("/sites");
    }
    console.error("Failed to fetch the media library from Sanity:", err);
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageSlug } = await searchParams;
  const result = await getMediaLibrary(pageSlug);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Media</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Every image used across this site&apos;s pages, and whether its alt text
          actually says anything.
        </p>
      </div>

      {result.kind === "ok" && result.filteredPageTitle && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300">
          <span>
            Showing images used on <span className="font-medium">{result.filteredPageTitle}</span>
          </span>
          <Link href="/media" className="shrink-0 underline hover:no-underline">
            Clear filter
          </Link>
        </div>
      )}

      {result.kind === "error" && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">Couldn&apos;t load the media library from Sanity.</p>
          <p className="mt-1 text-sm opacity-80">{result.message}</p>
        </div>
      )}

      {result.kind === "ok" && result.items.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {pageSlug
            ? "No images found for this page."
            : "No images yet. Images added to a page's content in Sanity Studio will show up here."}
        </div>
      )}

      {result.kind === "ok" && result.items.length > 0 && (
        <div className="mt-8">
          <MediaLibrary items={result.items} />
        </div>
      )}
    </div>
  );
}
