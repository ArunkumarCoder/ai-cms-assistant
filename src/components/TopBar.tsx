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
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
      <div>
        {sites.length > 1 && activeSiteId && (
          <SiteSwitcher sites={sites} activeSiteId={activeSiteId} />
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">{userEmail}</span>
        <form action={logoutAction}>
          <SubmitButton pendingLabel="Logging out…" className="underline hover:opacity-80">
            Log out
          </SubmitButton>
        </form>
      </div>
    </header>
  );
}
