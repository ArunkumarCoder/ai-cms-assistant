"use server";

import { AuthError } from "next-auth";
import { Prisma } from "@prisma/client";
import * as z from "zod";
import { headers } from "next/headers";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "./password";
import { checkAuthRateLimit } from "./rateLimit";

export type AuthActionState = { error?: string } | undefined;

const CredentialsSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters." }),
});

// Vercel (and most reverse proxies) set this to a comma-separated list of
// hops, client first — the direct-connection fallback matters for local dev,
// where no proxy sets this header at all. Coarser than a real client IP
// under some proxy configurations, but that's an acceptable tradeoff for a
// rate-limit *identifier*, not something security-critical is keyed on.
async function getClientIp(): Promise<string> {
  const forwardedFor = (await headers()).get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

function rateLimitedState(retryAfterSeconds: number): AuthActionState {
  return {
    error: `Too many attempts — please wait about ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"} and try again.`,
  };
}

export async function signupAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const verdict = checkAuthRateLimit("signup", await getClientIp());
  if (!verdict.allowed) return rateLimitedState(verdict.retryAfterSeconds!);

  const parsed = CredentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  try {
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password) },
    });
  } catch (err) {
    // Two signups for the same email racing past the findUnique check above
    // both fail here instead of one silently overwriting the other — the
    // unique constraint on User.email is the real guard, the check above is
    // just to give the common case a nicer message before hitting the DB.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { error: "An account with that email already exists." };
    }
    throw err;
  }

  // signIn() redirects on success by throwing Next's internal NEXT_REDIRECT
  // signal — that must propagate, not get swallowed here.
  await signIn("credentials", { email, password, redirectTo: "/pages" });
}

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const verdict = checkAuthRateLimit("login", await getClientIp());
  if (!verdict.allowed) return rateLimitedState(verdict.retryAfterSeconds!);

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/pages",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw err;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
