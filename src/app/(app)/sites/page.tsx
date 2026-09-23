import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getUserSites, resolveActiveSite } from "@/lib/sites/activeSite";
import { setActiveSiteAction, updateSiteBrandVoiceAction } from "@/lib/sites/actions";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Sites" };

export default async function SitesPage() {
  const user = await requireUser();
  const sites = await getUserSites(user.id);
  const activeSite = await resolveActiveSite(sites);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sites</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Sanity projects connected to your account.
          </p>
        </div>
        <Link
          href="/sites/connect"
          className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Connect a site
        </Link>
      </div>

      {sites.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-zinc-600 dark:text-zinc-400">
            No Sanity project connected yet — connect one to start pulling in
            real pages.
          </p>
          <Link
            href="/sites/connect"
            className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Connect a Sanity project
          </Link>
        </div>
      )}

      {sites.length > 0 && (
        <ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">
          {sites.map((site) => {
            const isActive = site.id === activeSite?.id;
            return (
              <li key={site.id} className="py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-medium">{site.name}</h2>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {site.sanityProjectId} · {site.sanityDataset}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                      Active
                    </span>
                  ) : (
                    <form action={setActiveSiteAction}>
                      <input type="hidden" name="siteId" value={site.id} />
                      <input type="hidden" name="redirectTo" value="/sites" />
                      <SubmitButton
                        pendingLabel="Switching…"
                        className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      >
                        Make active
                      </SubmitButton>
                    </form>
                  )}
                </div>

                <details className="mt-3" open={Boolean(site.brandVoice)}>
                  <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Brand voice{site.brandVoice ? "" : " (not set)"}
                  </summary>
                  <form action={updateSiteBrandVoiceAction} className="mt-2 max-w-xl space-y-2">
                    <input type="hidden" name="siteId" value={site.id} />
                    <textarea
                      name="brandVoice"
                      rows={3}
                      defaultValue={site.brandVoice ?? ""}
                      placeholder="e.g. Friendly and conversational, avoid jargon, always mention our 24/7 support."
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <SubmitButton
                      pendingLabel="Saving…"
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      Save brand voice
                    </SubmitButton>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
