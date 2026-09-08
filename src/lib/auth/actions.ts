"use server";

import { AuthError } from "next-auth";
import { Prisma } from "@prisma/client";
import * as z from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "./password";

export type AuthActionState = { error?: string } | undefined;

const CredentialsSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters." }),
});

export async function signupAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
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
