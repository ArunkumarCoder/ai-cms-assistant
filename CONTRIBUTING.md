# Contributing

This started as a solo portfolio project built day-by-day (see [SPEC.md](./SPEC.md) for the full build log), so there's no formal process here — but if you'd like to report a bug, suggest something, or send a fix, this is how.

## Reporting a bug or suggesting a change

Open a GitHub issue. Include, for a bug: what you ran, what you expected, what happened instead, and whether it reproduces with `npm run seed:demo` data or needs your own CMS/AI setup.

## Sending a change

1. Fork the repo and create a branch off `main`.
2. Install dependencies and set up your environment per the [README](./README.md#getting-started) — you'll need a Postgres database and at least a Sanity project (free tier is fine) to run the app; a WordPress install is only needed for that adapter's own tests.
3. Make your change. Keep it scoped — small, focused pull requests are much easier to review than ones that mix a fix with a refactor.
4. Before opening a PR, run the same checks CI runs:
   ```bash
   npm run lint
   npm test
   npx tsc --noEmit
   npx next build
   ```
5. Open a pull request against `main` describing what changed and why. Link the issue it addresses, if any.

## Code conventions

- TypeScript, strict mode — no `any` escapes without a good reason.
- New CMS-facing behavior goes through the `CmsAdapter` interface (`src/lib/cms`), not a one-off per-CMS branch elsewhere in the app. The shared contract test suite (`src/lib/cms/adapterContract.test.ts`) is the thing to run against any adapter change.
- New AI-facing behavior goes through `src/lib/ai`'s provider-agnostic client, not a direct SDK call from a route or component.
- Structured AI output is Zod-validated (`src/lib/ai/schemas`) — add or update a schema alongside any new AI response shape, don't parse free-form JSON by hand.
- Tests live next to the code they cover (`*.test.ts`), run with `npm test` (Vitest). There's no separate suite to remember.

## Questions

Open an issue — there's no dedicated chat/forum for this project.
