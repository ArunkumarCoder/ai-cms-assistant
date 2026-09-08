import Link from "next/link";

export default function PageNotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <Link href="/pages" className="text-sm text-zinc-500 hover:underline">
        ← Back to pages
      </Link>
      <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          There&apos;s no page with that slug in the active Site&apos;s
          Sanity dataset. It may have been renamed or deleted, or you might be
          on the wrong Site.
        </p>
      </div>
    </div>
  );
}
