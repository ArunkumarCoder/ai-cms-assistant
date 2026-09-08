export default function PagesLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="space-y-3">
        <div className="h-8 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-72 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-start justify-between gap-4 py-5">
            <div className="space-y-2">
              <div className="h-5 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-4 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <div className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
          </li>
        ))}
      </ul>
    </div>
  );
}
