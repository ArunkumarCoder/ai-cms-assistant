"use client";

import { useActionState, useState } from "react";
import { connectSiteAction } from "@/lib/cms/connectSiteAction";
import type { CmsProvider } from "@/types";

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function ConnectSiteForm() {
  const [state, formAction, pending] = useActionState(
    connectSiteAction,
    undefined,
  );
  const [cms, setCms] = useState<CmsProvider>("sanity");

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label className="block text-sm font-medium">CMS</label>
        <div className="mt-1 flex gap-2">
          {(["sanity", "wordpress"] as const).map((option) => (
            <label
              key={option}
              className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium ${
                cms === option
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="cms"
                value={option}
                checked={cms === option}
                onChange={() => setCms(option)}
                className="sr-only"
              />
              {option === "sanity" ? "Sanity" : "WordPress"}
            </label>
          ))}
        </div>
      </div>

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

      {cms === "sanity" ? (
        <>
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
        </>
      ) : (
        <>
          <div>
            <label htmlFor="url" className="block text-sm font-medium">
              Site URL
            </label>
            <input
              id="url"
              name="url"
              required
              placeholder="https://example.com"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium">
              WordPress username
            </label>
            <input
              id="username"
              name="username"
              required
              placeholder="admin"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="applicationPassword" className="block text-sm font-medium">
              Application password
            </label>
            <input
              id="applicationPassword"
              name="applicationPassword"
              type="password"
              required
              className={inputClass}
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              From your WordPress profile → Application Passwords — not your login
              password. Stored encrypted, never shown again after this.
            </p>
          </div>
        </>
      )}

      <div>
        <label htmlFor="brandVoice" className="block text-sm font-medium">
          Brand voice <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          id="brandVoice"
          name="brandVoice"
          rows={3}
          placeholder="e.g. Friendly and conversational, avoid jargon, always mention our 24/7 support."
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Included in every AI generation prompt for this site — can be added
          or changed later from the Sites screen.
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
