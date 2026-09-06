import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Next.js 16 renamed Middleware to Proxy (same mechanism, new file/convention
// — see node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
// This is only the *optimistic* check (cookie-based, no DB round trip) that
// Next's own auth guide recommends Proxy be limited to — every protected
// Server Component/Action still re-verifies via requireUser()
// (src/lib/auth/dal.ts), which is the real line of defense.
const PROTECTED_PREFIXES = ["/pages", "/sites"];

export default auth((req) => {
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    req.nextUrl.pathname.startsWith(prefix),
  );
  if (isProtected && !req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/pages/:path*", "/sites/:path*"],
};
