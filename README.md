# AI CMS Assistant

An AI-powered content assistant for CMSs — generate pages from a brief, score SEO, write image alt text, and draft FAQs with schema markup. Built for Sanity first, with WordPress as a stretch goal. AI calls run behind a provider-agnostic interface backed by OpenAI, Claude (Anthropic), and Groq.

See [SPEC.md](./SPEC.md) for the full product spec, data model, and AI call/provider inventory.

## Status

Day 1: spec + scaffold. Day 2: Sanity project, schema, and Studio (`studio/`) are live with sample content. Day 3: `/pages` and `/pages/[slug]` read live from Sanity end to end (no caching — see SPEC.md). Day 4–5: a CMS-agnostic `CmsAdapter` interface and its Sanity implementation, tested, with real (unexercised) write support. Day 6: real accounts (NextAuth/Auth.js, email+password) and a per-user "connect a Sanity project" flow — `/pages` now resolves each user's own connected project instead of one hardcoded `.env` project. No AI integration code yet — that's next.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, TypeScript, `src/` directory)
- [Tailwind CSS](https://tailwindcss.com) 4
- ESLint (`eslint-config-next`) + Prettier, configured to not conflict
- CMS: [Sanity](https://www.sanity.io) (first), WordPress (stretch goal)
- AI providers: OpenAI, Anthropic (Claude), Groq — behind a single adapter interface in `src/lib/ai`
- Auth: [NextAuth (Auth.js v5)](https://authjs.dev), Credentials (email/password) — see SPEC.md §8
- App datastore: [Prisma](https://www.prisma.io) + SQLite (accounts + connected Sanity projects)

## Getting started

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `NEXT_PUBLIC_SANITY_PROJECT_ID`/`NEXT_PUBLIC_SANITY_DATASET` — already point at this project's demo dataset by default.
- `AUTH_SECRET` and `SITE_TOKEN_ENCRYPTION_KEY` — generate each with `openssl rand -base64 32`.
- `DATABASE_URL="file:./dev.db"` — also copy this one line into a root `.env` (the Prisma CLI doesn't read `.env.local`).

Then set up the local database and start the app:

```bash
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up for an account, and connect a Sanity project (your own, or the demo project ID/dataset above — you'll still need a real API token from that project's manage.sanity.io → API → Tokens).

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
    cms/  # CMS adapter interface (Sanity now, WordPress later) + per-user resolution
    ai/   # Provider-agnostic AI adapter interface (OpenAI, Claude, Groq)
    auth/ # Auth.js config, Server Actions, password hashing, session DAL
    crypto/ # Encryption for stored third-party credentials (Sanity API tokens)
  types/  # Domain model (Site, Page, ContentBlock, SeoAudit, FaqItem, ImageAsset)
prisma/   # User/Site schema + migrations (accounts, connected Sanity projects)
studio/   # Standalone Sanity Studio (its own app — see SPEC.md for why)
```

## Sanity Studio

```bash
cd studio
npm install
npm run dev
```

Open [http://localhost:3333](http://localhost:3333). See [SPEC.md](./SPEC.md#4-sanity-project--schema-day-2) for the schema design and how it maps to (and diverges from) the domain model in `src/types/`.
