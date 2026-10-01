import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
      // WordPress staging site (Day 27) — a real, self-hosted WP install
      // serves its own media from its own domain, unlike Sanity's shared CDN
      // host, so every connected WordPress Site's own host would need to be
      // allow-listed here in a multi-tenant production build. Scoped to the
      // one staging host this project actually talks to.
      {
        protocol: "http",
        hostname: "localhost",
        port: "8890",
      },
    ],
  },
};

export default nextConfig;
