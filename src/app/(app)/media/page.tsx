import { redirect } from "next/navigation";
import { getAdapterForCurrentUser, NoSiteConnectedError } from "@/lib/cms";
import { assessAltText } from "@/lib/images";
import { MediaLibrary, type MediaLibraryItem } from "@/components/MediaLibrary";

export const metadata = { title: "Media" };

type MediaResult =
  | { kind: "ok"; items: MediaLibraryItem[] }
  | { kind: "error"; message: string };

// Images have no standalone document type (SPEC.md §4) — CmsAdapter.listImages
// already hides the "actually a cross-page body scan" reality (§6), so this
// screen composes it with getPages() to resolve each image's usedOnPageIds
// into a real title/slug, entirely through the adapter — never a direct
// Sanity query, per this task's own instruction.
async function getMediaLibrary(): Promise<MediaResult> {
  try {
    const adapter = await getAdapterForCurrentUser();
    const [pages, images] = await Promise.all([adapter.getPages(), adapter.listImages()]);
    const pageById = new Map(pages.map((page) => [page.id, page]));

    const items: MediaLibraryItem[] = images.map((image) => {
      const usedOnPage = pageById.get(image.usedOnPageIds[0]);
      return {
        image,
        assessment: assessAltText(image),
        page: usedOnPage ? { title: usedOnPage.title, slug: usedOnPage.slug } : null,
      };
    });

    return { kind: "ok", items };
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

export default async function MediaPage() {
  const result = await getMediaLibrary();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Media</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Every image used across this site&apos;s pages, and whether its alt text
          actually says anything.
        </p>
      </div>

      {result.kind === "error" && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">Couldn&apos;t load the media library from Sanity.</p>
          <p className="mt-1 text-sm opacity-80">{result.message}</p>
        </div>
      )}

      {result.kind === "ok" && result.items.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No images yet. Images added to a page&apos;s content in Sanity Studio
          will show up here.
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
