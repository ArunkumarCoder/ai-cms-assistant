import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// The one place route code should check "is someone logged in." proxy.ts
// does the same check optimistically (from the cookie alone, before a
// request even reaches a route) purely so logged-out users get redirected
// before rendering starts — per Next.js's own auth guidance, that check is
// not sufficient on its own and every Server Component/Action must
// re-verify, which is what calling this (or `auth()` directly) does.
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user;
}
