import { logoutAction } from "@/lib/auth/actions";
import { SiteSwitcher } from "./SiteSwitcher";
import { SubmitButton } from "./SubmitButton";

export function TopBar({
  userEmail,
  sites,
  activeSiteId,
}: {
  userEmail: string;
  sites: { id: string; name: string }[];
  activeSiteId: string | null;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-zinc-200 py-3 pr-4 pl-16 sm:pr-6 sm:pl-6 dark:border-zinc-800">
      <div className="min-w-0">
        {sites.length > 1 && activeSiteId && (
          <SiteSwitcher sites={sites} activeSiteId={activeSiteId} />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4 text-sm">
        <span className="hidden truncate text-zinc-500 sm:inline dark:text-zinc-400">{userEmail}</span>
        <form action={logoutAction}>
          <SubmitButton pendingLabel="Logging out…" className="underline hover:opacity-80">
            Log out
          </SubmitButton>
        </form>
      </div>
    </header>
  );
}
