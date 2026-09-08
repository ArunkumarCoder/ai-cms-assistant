export default function PageDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />

      <div className="mt-6 space-y-3">
        <div className="h-8 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <div className="mt-6 h-20 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />

      <div className="mt-8 space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
            style={{ width: `${90 - i * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}
