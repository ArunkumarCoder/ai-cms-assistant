import Link from "next/link";
import { ConnectSiteForm } from "@/components/ConnectSiteForm";

export const metadata = { title: "Connect a Sanity project" };

export default function ConnectSitePage() {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-16">
      <Link href="/sites" className="text-sm text-zinc-500 hover:underline">
        ← Back to Sites
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
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
