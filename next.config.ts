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
    // Next 16 added a second, independent check on top of `remotePatterns`:
    // the image optimizer resolves the hostname and refuses anything that
    // comes back as a private/local IP, even one already allow-listed above
    // — "localhost" resolves to 127.0.0.1/::1, so every image on the
    // WordPress staging site above was silently failing to load (discovered
    // Day 36, seeding a real demo through it for the first time). The doc's
    // own SSRF warning is about proxying *untrusted* local-network hosts;
    // this app already pins the one local host it will ever fetch images
    // from via `remotePatterns`, so there's no additional host this opens up
    // — it only unblocks the one already explicitly allow-listed.
    dangerouslyAllowLocalIP: true,
  },
};

export default nextConfig;
