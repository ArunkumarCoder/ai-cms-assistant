import { requireUser } from "@/lib/auth/dal";
import { ConnectSiteForm } from "@/components/ConnectSiteForm";

export const metadata = { title: "Connect a Sanity project" };

export default async function ConnectSitePage() {
  await requireUser();

  return (
    <div className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Connect a Sanity project
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        We&apos;ll make a real read call through this before saving it, so a
        wrong ID/dataset/ token fails here — not the first time you try to use
        it.
      </p>

      <ConnectSiteForm />
    </div>
  );
}
