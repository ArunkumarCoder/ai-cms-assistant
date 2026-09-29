export interface PageHistoryEntry {
  id: string;
  summary: string;
  userEmail: string | null;
  createdAt: Date;
}

// Plain server-rendered list, no "use client" — nothing here is interactive,
// so there's no reason to ship it to the browser as a client component. The
// "History" panel task item 4 asks for: what changed, by whom, when, for
// every entry src/lib/audit/ has recorded for this page. `entries` is
// already the newest-first, capped slice getPageActivity() returns —
// pagination/"load more" isn't attempted today, matching this task's own
// "a simple History panel is enough" framing.
export function PageHistoryPanel({ entries }: { entries: PageHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No activity recorded yet — saves, status changes, and applied AI edits will show up here.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{entry.summary}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {entry.userEmail ?? "Unknown user"} · {entry.createdAt.toLocaleString()}
          </p>
        </li>
      ))}
    </ul>
  );
}
