"use client";

import { useActionState } from "react";
import { connectSiteAction } from "@/lib/cms/connectSiteAction";

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function ConnectSiteForm() {
  const [state, formAction, pending] = useActionState(
    connectSiteAction,
    undefined,
  );

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Site name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="My client's site"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="projectId" className="block text-sm font-medium">
          Sanity project ID
        </label>
        <input
          id="projectId"
          name="projectId"
          required
          placeholder="nrk18555"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="dataset" className="block text-sm font-medium">
          Dataset
        </label>
        <input
          id="dataset"
          name="dataset"
          required
          defaultValue="production"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="token" className="block text-sm font-medium">
          API token
        </label>
        <input
          id="token"
          name="token"
          type="password"
          required
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          From manage.sanity.io → your project → API → Tokens. Stored encrypted,
          never shown again after this.
        </p>
      </div>

      {state?.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
      >
        {pending ? "Testing connection…" : "Connect"}
      </button>
    </form>
  );
}
