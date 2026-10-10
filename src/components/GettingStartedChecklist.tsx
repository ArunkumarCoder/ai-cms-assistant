import Link from "next/link";
import {
  isGettingStartedComplete,
  type ChecklistItem,
} from "@/lib/onboarding/checklist";

// Plain, server-rendered — nothing here needs client state. Disappears once
// every item is done rather than staying around as a dismissible banner
// someone has to close (Day 35 task: "it disappears once everything is
// done"), so a returning, fully-onboarded user never sees stale onboarding
// chrome at all.
export function GettingStartedChecklist({ items }: { items: ChecklistItem[] }) {
  if (isGettingStartedComplete(items)) return null;

  return (
    <section
      aria-label="Getting started"
      className="mt-6 rounded-lg border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/50 dark:bg-violet-950/30"
    >
      <h2 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
        Getting started
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            {/* Checkmark vs. open circle, not just a color swap — consistent
                with the rest of this app's "status isn't color-alone" rule
                (Day 33). */}
            <span
              aria-hidden="true"
              className={
                item.done
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-zinc-400 dark:text-zinc-600"
              }
            >
              {item.done ? "✓" : "○"}
            </span>
            {item.done ? (
              <span className="text-zinc-500 line-through dark:text-zinc-500">
                {item.label}
                <span className="sr-only"> (done)</span>
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-violet-800 underline hover:no-underline dark:text-violet-300"
              >
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
