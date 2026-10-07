// A typed, CMS-agnostic error both adapters throw for failures that
// originate at the client/transport boundary — auth rejected, unreachable
// host, rate limited, or a response the adapter's own mapping couldn't make
// sense of. Before today, each adapter let its own client's raw error (a
// `next-sanity`/`@sanity/client` `ClientError`, a `WordPressApiError`) pass
// straight through unchanged — fine for a developer reading a stack trace,
// but it meant a caller (a Server Action's catch block, eventually the UI)
// had no CMS-agnostic way to tell "the credentials are bad" apart from "the
// network is down" apart from "something came back we didn't expect,"
// without reaching into two completely different exception shapes. This
// does NOT replace the adapter's own intentional, already-meaningful domain
// errors (CreatePageInput validation failures, "no image found with that
// id," "page was written but could not be re-fetched") — those stay plain
// `Error`s with their existing messages, since they're caller/input
// problems or "nothing found" cases, not "the CMS misbehaved."
export type CmsAdapterErrorKind = "auth" | "network" | "rate-limited" | "malformed-response";

export class CmsAdapterError extends Error {
  readonly kind: CmsAdapterErrorKind;
  readonly cmsProvider: "sanity" | "wordpress";

  constructor(
    cmsProvider: "sanity" | "wordpress",
    kind: CmsAdapterErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CmsAdapterError";
    this.kind = kind;
    this.cmsProvider = cmsProvider;
  }
}
