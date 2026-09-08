"use client";

import { useEffect } from "react";
import Link from "next/link";

// Covers uncaught errors from any page under the app shell (Sites, Pages,
// Pages detail) — the Sidebar/TopBar in (app)/layout.tsx render around this
// since error.js only wraps the page, not the layout in the same segment.
export default function AppSegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/40">
        <h1 className="text-lg font-semibold text-red-800 dark:text-red-300">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-red-800/80 dark:text-red-300/80">
          {error.message || "An unexpected error occurred."}
        </p>
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => retry()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Try again
          </button>
          <Link href="/sites" className="text-sm underline">
            Back to Sites
          </Link>
        </div>
      </div>
    </div>
  );
}
