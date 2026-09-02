# AI CMS Assistant

An AI-powered content assistant for CMSs — generate pages from a brief, score SEO, write image alt text, and draft FAQs with schema markup. Built for Sanity first, with WordPress as a stretch goal. AI calls run behind a provider-agnostic interface backed by OpenAI, Claude (Anthropic), and Groq.

See [SPEC.md](./SPEC.md) for the full product spec, data model, and AI call/provider inventory.

## Status

Day 1: spec + scaffold. Day 2: Sanity project, schema, and Studio (`studio/`) are live with sample content. Day 3: `/pages` and `/pages/[slug]` read live from Sanity end to end (no caching — see SPEC.md). No AI integration code yet — that's next.

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, TypeScript, `src/` directory)
- [Tailwind CSS](https://tailwindcss.com) 4
- ESLint (`eslint-config-next`) + Prettier, configured to not conflict
- CMS: [Sanity](https://www.sanity.io) (first), WordPress (stretch goal)
- AI providers: OpenAI, Anthropic (Claude), Groq — behind a single adapter interface in `src/lib/ai`

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` and fill in your own keys before wiring up CMS/AI integrations.

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
    cms/  # CMS adapter interface (Sanity now, WordPress later)
    ai/   # Provider-agnostic AI adapter interface (OpenAI, Claude, Groq)
  types/  # Domain model (Site, Page, ContentBlock, SeoAudit, FaqItem, ImageAsset)
studio/   # Standalone Sanity Studio (its own app — see SPEC.md for why)
```

## Sanity Studio

```bash
cd studio
npm install
npm run dev
```

Open [http://localhost:3333](http://localhost:3333). See [SPEC.md](./SPEC.md#4-sanity-project--schema-day-2) for the schema design and how it maps to (and diverges from) the domain model in `src/types/`.
