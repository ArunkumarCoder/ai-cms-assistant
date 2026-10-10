"use client";

import { useActionState } from "react";
import type { AuthActionState } from "@/lib/auth/actions";

export function AuthForm({
  action,
  submitLabel,
  mode,
}: {
  action: (
    state: AuthActionState,
    formData: FormData,
  ) => Promise<AuthActionState>;
  submitLabel: string;
  // Drives the password field's `autoComplete` value and whether the
  // 8-character hint shows up front — a signup page previously hardcoded
  // `autoComplete="current-password"` (the login-screen value), which tells
  // a password manager "fill in the existing password" instead of "offer to
  // generate/save a new one," on the one screen where a new one is actually
  // being created (Day 35 walkthrough audit).
  mode: "login" | "signup";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          aria-describedby={mode === "signup" ? "password-hint" : undefined}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        {mode === "signup" && (
          <p
            id="password-hint"
            className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
          >
            At least 8 characters.
          </p>
        )}
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
      >
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}
