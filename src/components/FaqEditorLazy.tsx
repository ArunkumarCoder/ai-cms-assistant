"use client";

import dynamic from "next/dynamic";
import type { Page } from "@/types";

// src/app/(app)/pages/[slug]/page.tsx is a Server Component — per Next's own
// lazy-loading guide, a Server Component dynamically importing a Client
// Component does not code-split at all, so the `dynamic()` call has to live
// in a Client Component of its own. FAQs sit below the fold on the page
// editor and most visits don't touch them, so splitting this out still
// server-renders (default `ssr: true`) for first paint/no-JS, it just keeps
// the chunk out of the editor's initial bundle.
const FaqEditor = dynamic(() => import("./FaqEditor").then((mod) => mod.FaqEditor), {
  loading: () => (
    <section className="mt-12" role="status" aria-busy="true">
      <span className="sr-only">Loading FAQs…</span>
      <div className="flex items-center justify-between gap-4">
        <div className="h-7 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-8 w-28 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="mt-4 h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
    </section>
  ),
});

export function FaqEditorLazy({ page }: { page: Page }) {
  return <FaqEditor page={page} />;
}
