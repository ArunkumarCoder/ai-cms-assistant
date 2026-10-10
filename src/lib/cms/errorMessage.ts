import { CmsAdapterError } from "./errors";

// Mirrors src/lib/ai/errorMessage.ts's describeAiActionFailure — same reason
// to exist. Before Day 35's first-time-user audit, every CMS-touching Server
// Action and page loader caught its own errors with the same bare
// `err instanceof Error ? err.message : fallback`, which meant a raw
// `CmsAdapterError` — a Sanity 401, an unreachable WordPress host, a 429, a
// response neither adapter's mapping could parse — reached the UI completely
// unchanged. `CmsAdapterError.kind` (src/lib/cms/errors.ts) already
// classifies exactly which of those four happened; this is the one place
// that classification turns into something a non-technical first-time user
// can actually act on.
//
// Deliberately narrower than it could be: only `CmsAdapterError` gets
// translated. Every other thrown `Error` — `CreatePageInput` validation
// failures, "no page found with that slug," WordPress's own already-staged
// `diagnoseWordPressFailure` messages (connectSiteAction.ts) — keeps its
// real message unchanged, because those are already written to be read by
// the person using this app, not raw SDK/transport text.
export function describeCmsActionFailure(
  err: unknown,
  fallback: string,
): string {
  if (err instanceof CmsAdapterError) {
    switch (err.kind) {
      case "auth":
        return "This Site's connection was rejected — its saved credentials may have expired or been revoked. Reconnect it from the Sites screen.";
      case "network":
        return "Couldn't reach this Site's CMS right now — check that it's online, then try again.";
      case "rate-limited":
        return "The CMS is rate-limiting requests right now — please wait a moment and try again.";
      case "malformed-response":
        return "The CMS sent back something this app didn't expect. Try again, and reconnect the Site from the Sites screen if this keeps happening.";
    }
  }
  return err instanceof Error ? err.message : fallback;
}
