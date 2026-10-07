# AI CMS Assistant

An AI-powered content assistant for CMSs — generate pages from a brief, score SEO, write image alt text, and draft FAQs with schema markup. Sanity is the primary, fully-supported CMS; WordPress is a second `CmsAdapter` implementation (REST API + Application Passwords) proving the adapter boundary holds up against a second, very different backend — see [Connecting WordPress](#connecting-wordpress) below. AI calls run behind a provider-agnostic interface backed by OpenAI, Claude (Anthropic), and Groq.

See [SPEC.md](./SPEC.md) for the full product spec, data model, day-by-day build log, and the WordPress adapter's own known-limitations section (§25).

## Status

Phases 1–5 (Sanity: content model, AI generation/SEO/alt-text/FAQs, review workflow, dashboards, provider resilience) are complete and exercised end to end. Phase 6 added a second CMS: a WordPress `CmsAdapter` implementing the full read/write contract (REST API + Application Passwords + a small companion mu-plugin for custom fields), verified against a real WordPress install through the same unmodified screens and AI features Sanity uses — see SPEC.md §22–26 for the full build log, including real bugs found and fixed along the way (one of which, a `withQualityScoring` defect, affected Sanity too). Phase 7 (testing and polish) is underway: every structured AI response is now schema-validated with a shared, bounded retry policy (SPEC.md §27), and both `CmsAdapter` implementations share one contract test suite plus failure-path coverage with CI running on every push (SPEC.md §28, below).

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
- `npm test` — the full Vitest suite (unit tests, the shared CmsAdapter contract suite, AI schema/validation tests — everything under `src/**/*.test.ts`, one command)
- `npm run test:coverage` — the same suite with a coverage report (text + HTML in `coverage/`, gitignored)
- `npm run test:a11y` — the Playwright + axe-core accessibility audit (see [Accessibility](#accessibility) below)

## Testing

Everything runs through one command, `npm test` — there's no separate suite to remember to also run. [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs lint, a type-check, and the full test suite with coverage on every push and pull request, with no real database or API keys needed (`DATABASE_URL` is a placeholder — `prisma generate` only needs a syntactically valid connection string, it never connects).

**The shared adapter contract suite** (`src/lib/cms/adapterContract.test.ts` + `adapterContract.failures.test.ts`) is the one most worth knowing about: the same test bodies run against both `SanityAdapter` and `WordPressAdapter`, built from hand-written fixtures in `src/lib/cms/__fixtures__/` that render one CMS-agnostic "canonical" page/image into each CMS's own real raw REST/GROQ response shape. It covers the full `CmsAdapter` contract (list/get/create/update pages, list/update images, including a page missing every optional field and an empty collection) plus all four client-level failure modes (auth rejected, network error, malformed response, rate limited) for both adapters — and asserts, rather than skips, the one place their behavior genuinely differs: WordPress's documented alt-text-status fallback (SPEC.md §24) when an image was never touched by this app.

**Coverage** on the two layers that actually carry this project's architecture (`src/lib/cms/`, `src/lib/ai/` — not the whole `src/` tree, since a UI regression here isn't where a silent bug would be most expensive):

| | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| **Combined** | 85.2% | 75.4% | 93.4% | 87.2% |
| `lib/ai/` | 96.0% | 87.9% | 94.9% | 98.1% |
| `lib/cms/` | 83.9% | 75.5% | 94.5% | 85.9% |

Not chasing 100% — the real gaps are specific and known rather than hidden: `lib/ai/providers/registry.ts` (14%) only picks which already-well-tested provider class to construct from an API key in `process.env`, which isn't meaningfully testable without either a real key or mocking three SDK constructors for little value; each provider's own `getDefaultClient()` (the "construct the real SDK client" branch, as opposed to the injected-mock-client branch every other test uses) is similarly wiring, not logic. Run `npm run test:coverage` and open `coverage/index.html` for the full per-file breakdown.

## Accessibility

Day 33's pass covered keyboard operability, screen reader labeling/live regions, color contrast, responsive layout, and `prefers-reduced-motion`, targeting WCAG 2.1 A/AA throughout. The manual work is the real coverage — an automated scan only catches what's mechanically detectable:

- **Keyboard**: every interactive element is reachable and operable with Enter/Space, with a visible focus state. The app shell's sidebar collapses into a slide-in drawer below the `sm` breakpoint (`src/components/Sidebar.tsx`), with a hamburger toggle, Escape-to-close, click-outside-to-close, and auto-close on navigation. The FAQ editor's reordering already had discoverable Up/Down buttons (`aria-label`ed) as its only mechanism — there's no drag-and-drop in this codebase to retrofit.
- **Screen reader**: every form field has a real `<label htmlFor>` (or `aria-label` for icon-only/compact controls); async errors use `role="alert"`, async success/status text uses `role="status"`; the batch alt-text queue's progress bar is a real `role="progressbar"`. The SEO checklist's pass/warn/fail/not-applicable icons carry a visually-hidden status word, since the icon shape itself is `aria-hidden`. `DiffView`'s Accept/Reject buttons get a field-specific `aria-label` so they're distinguishable out of context. AI-authored heading blocks are normalized (`ContentBlocks.tsx`) so a page can never render a skipped heading level, regardless of what level an AI generation returned.
- **Color and contrast**: every text/background pair in both themes was checked against the WCAG AA ratios (4.5:1 normal text, 3:1 large text/non-text UI) — this caught several real failures hiding in plain sight: `zinc-400` body text on white (2.56:1), `amber-600`/`emerald-600` score text on white (3.19:1 / 3.77:1), and two places where the light/dark color pairing was accidentally reversed (lighter shade in light mode, darker in dark mode). The SEO checklist's pass/fail states and the quality score's color-coding now also carry a text label or icon, not color alone.
- **Responsive**: checked at phone/tablet/desktop widths. The dashboard's sub-score grid, and the Sites/Pages list rows, now stack instead of crowding or overflowing on a narrow screen; the SERP preview already had no fixed widths.
- **Reduced motion**: a global CSS override (`src/app/globals.css`) plus Tailwind's `motion-reduce:` variant on every `animate-*`/`transition-*` usage, plus a JS-level `prefers-reduced-motion` check before any explicit `scrollIntoView({ behavior: "smooth" })` call.

**Automated audit** — `npm run test:a11y` runs axe-core (via `@axe-core/playwright`) against a real running instance (`playwright.config.ts` starts `next dev` itself), scoped to WCAG 2.0/2.1 A+AA rules. `e2e/global-setup.ts` seeds one fixed test account so the suite can log in and audit authenticated screens, not just `/login`/`/signup`. As of this pass: **0 violations** on every screen the suite reaches — `/login`, `/signup`, `/sites` (app shell + empty state), `/sites/connect`. Four more specs (pages list, page editor, Media Library, dashboard) exist in `e2e/a11y.spec.ts` but auto-skip unless `.env.local` has real `SANITY_API_TOKEN`/`NEXT_PUBLIC_SANITY_PROJECT_ID`/`NEXT_PUBLIC_SANITY_DATASET` set, since there's no fixture CMS to connect to otherwise — those four screens were still covered by the manual keyboard/screen-reader/contrast passes above, just not by this automated run.

## Project structure

```
src/
  app/    # Next.js App Router routes
  lib/
    cms/  # CmsAdapter interface + Sanity/WordPress implementations + per-user resolution
      __fixtures__/ # Shared test fixtures powering the adapter contract suite
    ai/   # Provider-agnostic AI adapter interface (OpenAI, Claude, Groq)
    auth/ # Auth.js config, Server Actions, password hashing, session DAL
    crypto/ # Encryption for stored third-party credentials (Sanity tokens, WordPress app passwords)
  types/  # Domain model (Site, Page, ContentBlock, SeoAudit, FaqItem, ImageAsset)
prisma/     # User/Site schema + migrations (accounts, connected Sites)
studio/     # Standalone Sanity Studio (its own app — see SPEC.md for why)
wordpress/  # WordPress-side companion mu-plugin (schema-as-code, mirrors studio/)
.github/workflows/ # CI: lint, type-check, full test suite with coverage
```

## Sanity Studio

```bash
cd studio
npm install
npm run dev
```

Open [http://localhost:3333](http://localhost:3333). See [SPEC.md](./SPEC.md#4-sanity-project--schema-day-2) for the schema design and how it maps to (and diverges from) the domain model in `src/types/`.
