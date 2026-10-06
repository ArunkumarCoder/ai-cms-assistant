# AI CMS Assistant

An AI-powered content assistant for CMSs — generate pages from a brief, score SEO, write image alt text, and draft FAQs with schema markup. Sanity is the primary, fully-supported CMS; WordPress is a second `CmsAdapter` implementation (REST API + Application Passwords) proving the adapter boundary holds up against a second, very different backend — see [Connecting WordPress](#connecting-wordpress) below. AI calls run behind a provider-agnostic interface backed by OpenAI, Claude (Anthropic), and Groq.

See [SPEC.md](./SPEC.md) for the full product spec, data model, day-by-day build log, and the WordPress adapter's own known-limitations section (§25).

## Status

Phases 1–5 (Sanity: content model, AI generation/SEO/alt-text/FAQs, review workflow, dashboards, provider resilience) are complete and exercised end to end. Phase 6 added a second CMS: a WordPress `CmsAdapter` implementing the full read/write contract (REST API + Application Passwords + a small companion mu-plugin for custom fields), verified against a real WordPress install through the same unmodified screens and AI features Sanity uses — see SPEC.md §22–25 for the full build log, including two real bugs found and fixed along the way (one of which, a `withQualityScoring` defect, affected Sanity too). Next: Phase 7, automated JSON-schema validation across every structured AI response.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, TypeScript, `src/` directory)
- [Tailwind CSS](https://tailwindcss.com) 4
- ESLint (`eslint-config-next`) + Prettier, configured to not conflict
- CMS: [Sanity](https://www.sanity.io) (primary), WordPress (REST API + Application Passwords) — both behind one `CmsAdapter` interface in `src/lib/cms`
- AI providers: OpenAI, Anthropic (Claude), Groq — behind a single adapter interface in `src/lib/ai`
- Auth: [NextAuth (Auth.js v5)](https://authjs.dev), Credentials (email/password) — see SPEC.md §8
- App datastore: [Prisma](https://www.prisma.io) + Postgres (accounts + connected Sites)

## Getting started

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `NEXT_PUBLIC_SANITY_PROJECT_ID`/`NEXT_PUBLIC_SANITY_DATASET` — already point at this project's demo dataset by default.
- `AUTH_SECRET` and `SITE_TOKEN_ENCRYPTION_KEY` — generate each with `openssl rand -base64 32`.
- `DATABASE_URL` — a Postgres connection string (any Postgres works; this project uses the "Prisma Postgres" Vercel marketplace integration). Also copy this one line into a root `.env` — the Prisma CLI doesn't read `.env.local`.

Then set up the database and start the app:

```bash
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up for an account, and connect a site — a Sanity project (your own, or the demo project ID/dataset above, plus a real API token from that project's manage.sanity.io → API → Tokens) or a WordPress site (see below).

## Connecting WordPress

WordPress support needs one small companion file installed on the target site before connecting, since this app's custom fields (quality score, FAQs, review status, SEO meta) have no native WordPress equivalent and WordPress has no bundled way to expose them over REST without one.

1. **Install the companion plugin.** Copy [`wordpress/mu-plugins/ai-cms-assistant-fields.php`](./wordpress/mu-plugins/ai-cms-assistant-fields.php) into the target site's `wp-content/mu-plugins/` directory. It's a WordPress "must-use" plugin — no activation step, it loads automatically. This registers the `ai_cms_page` custom post type (REST base `ai-cms-pages`), the `in_review`/`approved` custom statuses, and the custom meta fields this adapter reads and writes — all via WordPress core APIs (`register_post_type`/`register_post_status`/`register_post_meta`), no third-party plugin (e.g. ACF) required.
2. **Generate an Application Password.** In wp-admin: **Users → Profile → Application Passwords**, give it a name, click **Add New Application Password**, and copy the generated value immediately — WordPress only shows it once.
   - **HTTPS requirement:** WordPress disables Application Passwords entirely on a site served over plain HTTP, *unless* `WP_ENVIRONMENT_TYPE` is set to `"local"` in `wp-config.php` (`wp config set WP_ENVIRONMENT_TYPE local --type=constant` via WP-CLI, or add the constant by hand). A real production site over HTTPS needs no such change.
3. **Connect it.** From this app's Sites screen, choose "WordPress," and enter the site's URL, the username the application password belongs to, and the application password itself.

If something goes wrong, the connect form's error message tells you which of three things failed — unreachable/not-a-WordPress-REST-API, rejected credentials, or a reachable-and-authenticated site that's simply missing the plugin from step 1 — rather than one generic "couldn't connect."

See [SPEC.md §22–25](./SPEC.md) for the full content-model mapping (Gutenberg blocks ↔ `ContentBlock[]`, custom post statuses ↔ `PageStatus`, etc.) and the adapter's documented known limitations (mainly around image usage-attribution accuracy, which WordPress doesn't track the way Sanity does).

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — ESLint
- `npm run format` — Prettier, writes changes
- `npm run format:check` — Prettier, check only (CI-friendly)

## Project structure

```
src/
  app/    # Next.js App Router routes
  lib/
    cms/  # CmsAdapter interface + Sanity/WordPress implementations + per-user resolution
    ai/   # Provider-agnostic AI adapter interface (OpenAI, Claude, Groq)
    auth/ # Auth.js config, Server Actions, password hashing, session DAL
    crypto/ # Encryption for stored third-party credentials (Sanity tokens, WordPress app passwords)
  types/  # Domain model (Site, Page, ContentBlock, SeoAudit, FaqItem, ImageAsset)
prisma/     # User/Site schema + migrations (accounts, connected Sites)
studio/     # Standalone Sanity Studio (its own app — see SPEC.md for why)
wordpress/  # WordPress-side companion mu-plugin (schema-as-code, mirrors studio/)
```

## Sanity Studio

```bash
cd studio
npm install
npm run dev
```

Open [http://localhost:3333](http://localhost:3333). See [SPEC.md](./SPEC.md#4-sanity-project--schema-day-2) for the schema design and how it maps to (and diverges from) the domain model in `src/types/`.
