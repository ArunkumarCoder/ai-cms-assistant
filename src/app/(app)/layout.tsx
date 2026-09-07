import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/dal";
import { getUserSites, resolveActiveSite } from "@/lib/sites/activeSite";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

// Shell for every logged-in screen (Sites, Pages, and later Media/FAQs/
// Dashboard) — auth and "which Site is active" are resolved once here, not
// re-fetched by each page underneath.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const sites = await getUserSites(user.id);
  const activeSite = await resolveActiveSite(sites);

  return (
    <div className="flex flex-1">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar
          userEmail={user.email ?? ""}
          sites={sites.map((site) => ({ id: site.id, name: site.name }))}
          activeSiteId={activeSite?.id ?? null}
        />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
