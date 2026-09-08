"use client";

import { useEffect } from "react";
import Link from "next/link";

// Root-level boundary: catches crashes outside the app shell (the home page,
// /login, /signup) as well as failures inside (app)/layout.tsx itself — that
// layout's own data fetching isn't wrapped by (app)/error.tsx, since error.js
// never wraps the layout in its own segment.
export default function RootError({
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
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/40">
        <h1 className="text-lg font-semibold text-red-800 dark:text-red-300">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-red-800/80 dark:text-red-300/80">
          {error.message || "An unexpected error occurred."}
        </p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            onClick={() => retry()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Try again
          </button>
          <Link href="/login" className="text-sm underline">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
