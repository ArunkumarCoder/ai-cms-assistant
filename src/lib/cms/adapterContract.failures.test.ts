import { describe, expect, it, vi } from "vitest";
import type { CmsAdapter } from "./adapter";
import type { Site } from "@/types";
import { SanityAdapter } from "./sanityAdapter";
import { WordPressAdapter, WordPressApiError } from "./wordpressAdapter";
import { CmsAdapterError, type CmsAdapterErrorKind } from "./errors";
import { makeSanityClient } from "./__fixtures__/sanityFixtures";
import { makeWordPressClient } from "./__fixtures__/wordpressFixtures";

// Before today, a client-level failure (Sanity's own ClientError, WordPress's
// WordPressApiError) passed straight through an adapter's public methods
// unchanged — a caller had no CMS-agnostic way to tell "credentials
// rejected" apart from "network down" apart from "the CMS sent something we
// couldn't use," without reaching into two completely different exception
// shapes. Both adapters now classify every client/transport failure into one
// shared CmsAdapterError (src/lib/cms/errors.ts) before it ever leaves the
// adapter — this suite proves that for the four failure modes the task calls
// out, for both adapters, parameterized the same way adapterContract.test.ts
// is.

const sanitySite: Site = {
  id: "site-sanity",
  userId: "user-1",
  name: "Sanity Test Site",
  cms: "sanity",
  sanityProjectId: "proj",
  sanityDataset: "production",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const wordpressSite: Site = {
  id: "site-wordpress",
  userId: "user-1",
  name: "WordPress Test Site",
  cms: "wordpress",
  wordpressUrl: "http://example.test",
  wordpressUsername: "admin",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

// A minimal stand-in for `@sanity/client`'s real `ClientError`/`ServerError`
// — both carry a plain `statusCode: number` property, which is the only
// signal sanityAdapter.ts's classifier reads (see its own comment for why
// duck-typing this one field is enough, without depending on the real SDK's
// exception classes in a unit test).
class FakeSanityClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
  }
}

interface FailureHarness {
  name: "Sanity" | "WordPress";
  adapterRejecting(error: unknown): CmsAdapter;
  errorFor(kind: CmsAdapterErrorKind): unknown;
}

const sanityFailureHarness: FailureHarness = {
  name: "Sanity",
  adapterRejecting: (error) =>
    new SanityAdapter(sanitySite, makeSanityClient({ fetch: vi.fn().mockRejectedValue(error) })),
  errorFor: (kind) => {
    switch (kind) {
      case "auth":
        return new FakeSanityClientError("Unauthorized", 401);
      case "rate-limited":
        return new FakeSanityClientError("Too Many Requests", 429);
      case "malformed-response":
        return new FakeSanityClientError("Internal Server Error", 500);
      case "network":
        return new TypeError("fetch failed");
    }
  },
};

const wordpressFailureHarness: FailureHarness = {
  name: "WordPress",
  adapterRejecting: (error) =>
    new WordPressAdapter(wordpressSite, makeWordPressClient({ get: vi.fn().mockRejectedValue(error) })),
  errorFor: (kind) => {
    switch (kind) {
      case "auth":
        return new WordPressApiError("401 Unauthorized", 401);
      case "rate-limited":
        return new WordPressApiError("429 Too Many Requests", 429);
      case "malformed-response":
        // The real client throws this exact shape (a 2xx status alongside
        // an error) only from its own "valid status but body wasn't JSON"
        // branch — see wordpressAdapter.ts's FetchWordPressApiClient.
        return new WordPressApiError("Body wasn't valid JSON", 200);
      case "network":
        return new WordPressApiError("Couldn't reach the host — fetch failed.");
    }
  },
};

const harnesses = [sanityFailureHarness, wordpressFailureHarness];
const kinds: CmsAdapterErrorKind[] = ["auth", "network", "rate-limited", "malformed-response"];

for (const harness of harnesses) {
  describe(`${harness.name} adapter — failure paths surface a consistent, typed error`, () => {
    for (const kind of kinds) {
      it(`classifies a "${kind}" failure as CmsAdapterError, not the raw client/SDK error`, async () => {
        const originalError = harness.errorFor(kind);
        const adapter = harness.adapterRejecting(originalError);

        const error = await adapter.getPages().then(
          () => {
            throw new Error("expected getPages() to reject");
          },
          (err: unknown) => err,
        );

        expect(error).toBeInstanceOf(CmsAdapterError);
        expect((error as CmsAdapterError).kind).toBe(kind);
        expect((error as CmsAdapterError).cmsProvider).toBe(harness.name.toLowerCase());
        // The underlying client/SDK error is preserved, not discarded — a
        // developer reading logs still has the original detail available
        // via `.cause`, just not leaked to a caller as the thrown type.
        expect((error as CmsAdapterError).cause).toBe(originalError);
      });
    }

    it("classifies the same way across every CmsAdapter method that touches the client, not just getPages", async () => {
      const authError = harness.errorFor("auth");
      const adapter = harness.adapterRejecting(authError);

      for (const attempt of [
        () => adapter.getPages(),
        () => adapter.getPage("some-slug"),
        () => adapter.listImages(),
      ]) {
        await expect(attempt()).rejects.toBeInstanceOf(CmsAdapterError);
        await expect(attempt()).rejects.toMatchObject({ kind: "auth" });
      }
    });

    it("does not reclassify the adapter's own input-validation errors as a CMS failure", async () => {
      // CreatePageInput validation happens before any client call — these
      // stay plain, specific Errors (see errors.ts's own top comment for
      // why), never wrapped as if the CMS itself had done something wrong.
      const adapter = harness.adapterRejecting(harness.errorFor("network"));
      await expect(
        adapter.createPage({
          slug: "",
          title: "",
          metaDescription: "",
          pageType: "other",
        }),
      ).rejects.not.toBeInstanceOf(CmsAdapterError);
    });
  });
}
