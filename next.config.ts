import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// `script-src` needs `'unsafe-inline'` too, not just `style-src` — found live
// (Day 37), not just read in the docs: the App Router streams its own RSC
// hydration payload into the page via inline `self.__next_f.push(...)`
// `<script>` tags on essentially every page with any client interactivity,
// and a `'self'`-only policy silently blocked every one of them, breaking
// hydration everywhere (the login page rendered, but its form never became
// interactive — caught by `test:a11y` actually trying to fill it in, not by
// a passive read of the response). This exactly matches Next's own
// "Without Nonces" example (node_modules/next/dist/docs/01-app/02-guides/
// content-security-policy.md), which includes `'unsafe-inline'` in
// `script-src` for precisely this reason — the real alternative is the
// nonce-based approach, which requires *every* route to render dynamically
// (no static optimization anywhere), a bigger tradeoff than this app's
// threat model (a portfolio demo, not a target with strict compliance needs)
// justifies today. JSON-LD (`<script type="application/ld+json">`,
// src/app/(app)/pages/[slug]/page.tsx's FAQ schema) is inert data, not
// executable script, so it doesn't factor into this either way. `'unsafe-eval'`
// is added outside production only — React's dev mode uses `eval()` for
// richer debugging (reconstructing server stack traces in the browser),
// which Next's own CSP guide calls out explicitly; React never uses `eval()`
// in production, so this never loosens the policy that actually ships.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
      // WordPress staging site (Day 27), dev/test only — never shipped in a
      // production build. A real multi-tenant production deployment, where
      // any user can connect any WordPress URL, can't express "allow every
      // future connected Site's own host" as a static remotePatterns list at
      // all; see SPEC.md's Day 37 section for why that's a deliberately
      // deferred architectural gap, not an oversight, and what the options
      // are (a wildcard `hostname: "**"` pattern, or `unoptimized` images
      // for CMS-hosted content).
      ...(isProduction
        ? []
        : [
            {
              protocol: "http" as const,
              hostname: "localhost",
              port: "8890",
            },
          ]),
    ],
    // Next 16's private-IP SSRF guard on top of `remotePatterns` (see the
    // comment this replaced, in git history) — only disabled outside
    // production, where the one pinned host above is a local dev/test
    // server, never in the production bundle where it would have nothing
    // left to apply to anyway (the pattern it was unblocking isn't present).
    dangerouslyAllowLocalIP: !isProduction,
  },
  async headers() {
    return [
      {
        // Every route, including API routes — these headers protect the
        // whole origin, not just the rendered pages.
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Both set: `X-Frame-Options` for older browsers that don't honor
          // CSP's `frame-ancestors`, which is otherwise the modern
          // equivalent and already set above.
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
