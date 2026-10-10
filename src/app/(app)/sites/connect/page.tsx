import Link from "next/link";
import { ConnectSiteForm } from "@/components/ConnectSiteForm";

export const metadata = { title: "Connect a Site" };

export default function ConnectSitePage() {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-16">
      <Link href="/sites" className="text-sm text-zinc-500 hover:underline">
        ← Back to Sites
      </Link>

      {/* CMS-neutral on purpose — the radio button just below lets you pick
          Sanity or WordPress, and this heading used to say "Connect a Sanity
          project" unconditionally, even for someone about to pick WordPress
          (Day 35 walkthrough audit). */}
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Connect a Site
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        We&apos;ll make a real read call through this before saving it, so a
        wrong ID/dataset/token (or URL/credentials) fails here — not the first
        time you try to use it.
      </p>

      <ConnectSiteForm />
    </div>
  );
}
