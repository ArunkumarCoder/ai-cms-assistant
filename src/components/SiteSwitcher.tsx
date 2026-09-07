"use client";

import { usePathname } from "next/navigation";
import { setActiveSiteAction } from "@/lib/sites/actions";

// Auto-submits on change (via requestSubmit) rather than needing a separate
// "Go" button — this is meant to feel like a lightweight context switch, not
// a form the user fills in.
export function SiteSwitcher({
  sites,
  activeSiteId,
}: {
  sites: { id: string; name: string }[];
  activeSiteId: string;
}) {
  const pathname = usePathname();

  return (
    <form
      action={setActiveSiteAction}
      className="flex items-center gap-2 text-sm"
    >
      <input type="hidden" name="redirectTo" value={pathname} />
      <select
        name="siteId"
        defaultValue={activeSiteId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
    </form>
  );
}
