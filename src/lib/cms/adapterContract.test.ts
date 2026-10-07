import { describe, expect, it, vi } from "vitest";
import type { CmsAdapter } from "./adapter";
import type { CreatePageInput } from "./types";
import type { ContentBlock, FaqItem, Site } from "@/types";
import { SanityAdapter } from "./sanityAdapter";
import { WordPressAdapter } from "./wordpressAdapter";
import {
  type CanonicalBlock,
  type CanonicalImage,
  type CanonicalPage,
  FULL_PAGE,
  MINIMAL_PAGE,
  UPDATED_PAGE,
  REVIEWED_IMAGE,
  MISSING_ALT_IMAGE,
  AI_GENERATED_IMAGE,
} from "./__fixtures__/canonical";
import * as sanityFx from "./__fixtures__/sanityFixtures";
import * as wpFx from "./__fixtures__/wordpressFixtures";

// One shared suite, run once per adapter via the `harnesses` loop below —
// the actual `it(...)` bodies are written exactly once. Each harness's job
// is only to turn a CanonicalPage/CanonicalImage fixture into a CmsAdapter
// pre-wired with the matching CMS-native mock responses; everything after
// that calls only the public CmsAdapter interface, so a change to either
// adapter's internals that breaks the contract shows up here regardless of
// which CMS it was made for.

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

function toContentBlock(block: CanonicalBlock, index: number): ContentBlock {
  if (block.type === "heading") {
    return { id: `in-${index}`, type: "heading", order: index, content: block.content, metadata: { level: block.level } };
  }
  return { id: `in-${index}`, type: "paragraph", order: index, content: block.content };
}

function toCreatePageInput(page: CanonicalPage): CreatePageInput {
  return {
    slug: page.slug,
    title: page.title,
    metaDescription: page.metaDescription,
    targetKeyword: page.targetKeyword,
    pageType: page.pageType,
    status: page.status,
    contentBlocks: page.contentBlocks.map(toContentBlock),
    faqItems: page.faqItems.map(
      (item, i): FaqItem => ({
        id: `faq-in-${i}`,
        pageId: "",
        question: item.question,
        answer: item.answer,
        order: i,
        source: "manual",
      }),
    ),
    qualityScore: page.qualityScore,
  };
}

// Strips the one field each adapter is free to assign its own way (block
// ids are synthesized positionally by WordPress, carried through from
// Sanity's own `_key` — see wordpressAdapter.ts's file-header comment) so
// the shared assertions compare everything that SHOULD be identical.
function withoutBlockIds(blocks: ContentBlock[]): Omit<ContentBlock, "id">[] {
  return blocks.map((block) => {
    const { id, ...rest } = block;
    void id;
    return rest;
  });
}
function withoutFaqIds(items: FaqItem[]): Omit<FaqItem, "id" | "pageId">[] {
  return items.map((item) => {
    const { id, pageId, ...rest } = item;
    void id;
    void pageId;
    return rest;
  });
}

interface AdapterHarness {
  name: "Sanity" | "WordPress";
  idFor(key: string): string;
  mediaIdFor(key: string): string;
  forGetPages(pages: CanonicalPage[]): CmsAdapter;
  forGetPage(detail: CanonicalPage | null): CmsAdapter;
  forGetPageMissingOptionalFields(detail: CanonicalPage): CmsAdapter;
  forCreatePage(resultDetail: CanonicalPage): CmsAdapter;
  forUpdatePage(resultDetail: CanonicalPage): CmsAdapter;
  forListImages(images: CanonicalImage[]): CmsAdapter;
  forUpdateImage(resultImage: CanonicalImage): CmsAdapter;
}

const sanityHarness: AdapterHarness = {
  name: "Sanity",
  idFor: (key) => key,
  mediaIdFor: (key) => key,
  forGetPages: (pages) =>
    new SanityAdapter(
      sanitySite,
      sanityFx.makeSanityClient({ fetch: vi.fn().mockResolvedValue(pages.map(sanityFx.toSanityPageListItem)) }),
    ),
  forGetPage: (detail) =>
    new SanityAdapter(
      sanitySite,
      sanityFx.makeSanityClient({
        fetch: vi.fn().mockResolvedValue(detail ? sanityFx.toSanityPageDetail(detail) : null),
      }),
    ),
  forGetPageMissingOptionalFields: (detail) =>
    new SanityAdapter(
      sanitySite,
      sanityFx.makeSanityClient({ fetch: vi.fn().mockResolvedValue(sanityFx.toSanityPageDetail(detail)) }),
    ),
  forCreatePage: (resultDetail) =>
    new SanityAdapter(
      sanitySite,
      sanityFx.makeSanityClient({
        create: vi.fn().mockResolvedValue({ _id: resultDetail.key }),
        fetch: vi.fn().mockResolvedValue(sanityFx.toSanityPageDetail(resultDetail)),
      }),
    ),
  forUpdatePage: (resultDetail) =>
    new SanityAdapter(
      sanitySite,
      sanityFx.makeSanityClient({ fetch: vi.fn().mockResolvedValue(sanityFx.toSanityPageDetail(resultDetail)) }),
    ),
  forListImages: (images) =>
    new SanityAdapter(
      sanitySite,
      sanityFx.makeSanityClient({
        fetch: vi.fn().mockResolvedValue([sanityFx.toSanityImagesRow(FULL_PAGE, images)]),
      }),
    ),
  forUpdateImage: (resultImage) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ _id: FULL_PAGE.key }) // PAGE_CONTAINING_IMAGE_KEY_QUERY
      .mockResolvedValueOnce([sanityFx.toSanityImagesRow(FULL_PAGE, [resultImage])]); // re-fetch after patch
    return new SanityAdapter(sanitySite, sanityFx.makeSanityClient({ fetch }));
  },
};

const wordpressHarness: AdapterHarness = {
  name: "WordPress",
  idFor: (key) => String(wpFx.wpPageIdFor(key)),
  mediaIdFor: (key) => String(wpFx.wpMediaIdFor(key)),
  forGetPages: (pages) =>
    new WordPressAdapter(
      wordpressSite,
      wpFx.makeWordPressClient({ get: vi.fn().mockResolvedValue(pages.map((p) => wpFx.toWpPage(p))) }),
    ),
  forGetPage: (detail) =>
    new WordPressAdapter(
      wordpressSite,
      wpFx.makeWordPressClient({ get: vi.fn().mockResolvedValue(detail ? [wpFx.toWpPage(detail)] : []) }),
    ),
  forGetPageMissingOptionalFields: (detail) =>
    new WordPressAdapter(
      wordpressSite,
      wpFx.makeWordPressClient({ get: vi.fn().mockResolvedValue([wpFx.toWpPage(detail, { omitMeta: true })]) }),
    ),
  forCreatePage: (resultDetail) =>
    new WordPressAdapter(
      wordpressSite,
      wpFx.makeWordPressClient({
        post: vi.fn().mockResolvedValue({ id: wpFx.wpPageIdFor(resultDetail.key) }),
        get: vi.fn().mockResolvedValue(wpFx.toWpPage(resultDetail)),
      }),
    ),
  forUpdatePage: (resultDetail) =>
    new WordPressAdapter(
      wordpressSite,
      wpFx.makeWordPressClient({
        post: vi.fn().mockResolvedValue({}),
        get: vi.fn().mockResolvedValue(wpFx.toWpPage(resultDetail)),
      }),
    ),
  forListImages: (images) =>
    new WordPressAdapter(
      wordpressSite,
      wpFx.makeWordPressClient({ get: vi.fn().mockResolvedValue(images.map(wpFx.toWpMedia)) }),
    ),
  forUpdateImage: (resultImage) =>
    new WordPressAdapter(
      wordpressSite,
      wpFx.makeWordPressClient({
        post: vi.fn().mockResolvedValue({}),
        get: vi.fn().mockResolvedValue(wpFx.toWpMedia(resultImage)),
      }),
    ),
};

const harnesses = [sanityHarness, wordpressHarness];

for (const harness of harnesses) {
  describe(`${harness.name} adapter — shared CmsAdapter contract`, () => {
    it("getPages lists every page as a PageSummary, full fields and all", async () => {
      const adapter = harness.forGetPages([FULL_PAGE]);
      const pages = await adapter.getPages();

      expect(pages).toHaveLength(1);
      expect(pages[0]).toMatchObject({
        id: harness.idFor(FULL_PAGE.key),
        cmsDocumentId: harness.idFor(FULL_PAGE.key),
        slug: FULL_PAGE.slug,
        title: FULL_PAGE.title,
        metaDescription: FULL_PAGE.metaDescription,
        targetKeyword: FULL_PAGE.targetKeyword,
        pageType: FULL_PAGE.pageType,
        status: FULL_PAGE.status,
        qualityScore: FULL_PAGE.qualityScore,
        faqCount: FULL_PAGE.faqItems.length,
      });
    });

    it("getPages returns an empty list for a site with no pages yet, not an error", async () => {
      const adapter = harness.forGetPages([]);
      await expect(adapter.getPages()).resolves.toEqual([]);
    });

    it("getPages handles a full page of results (100 items) without breaking", async () => {
      // Neither adapter implements pagination today (both always request a
      // single page of up to 100 results) — this confirms that boundary
      // doesn't silently drop or choke on the maximum single-page size,
      // not that multi-page fetching works, since it doesn't exist yet.
      const many = Array.from({ length: 100 }, (_, i) => ({
        ...MINIMAL_PAGE,
        key: `${MINIMAL_PAGE.key}-${i}`,
        slug: `${MINIMAL_PAGE.slug}-${i}`,
      }));
      // WordPress needs every key present in its id lookup table; reuse a
      // single real key's conversion for all 100 rather than registering 100
      // fixture ids just to prove list-handling at scale.
      const adapter =
        harness.name === "WordPress"
          ? new WordPressAdapter(
              wordpressSite,
              wpFx.makeWordPressClient({
                get: vi.fn().mockResolvedValue(many.map(() => wpFx.toWpPage(MINIMAL_PAGE))),
              }),
            )
          : harness.forGetPages(many);
      const pages = await adapter.getPages();
      expect(pages).toHaveLength(100);
    });

    it("getPage returns the full Page, including content blocks and FAQs, for a page with every field filled in", async () => {
      const adapter = harness.forGetPage(FULL_PAGE);
      const page = await adapter.getPage(FULL_PAGE.slug);

      expect(page).not.toBeNull();
      expect(page).toMatchObject({
        id: harness.idFor(FULL_PAGE.key),
        cmsDocumentId: harness.idFor(FULL_PAGE.key),
        slug: FULL_PAGE.slug,
        title: FULL_PAGE.title,
        metaDescription: FULL_PAGE.metaDescription,
        targetKeyword: FULL_PAGE.targetKeyword,
        pageType: FULL_PAGE.pageType,
        status: FULL_PAGE.status,
        qualityScore: FULL_PAGE.qualityScore,
      });
      expect(withoutBlockIds(page!.contentBlocks)).toEqual([
        { type: "heading", order: 0, content: "Welcome to Our Service", metadata: { level: 2 } },
        { type: "paragraph", order: 1, content: "We solve real problems for real customers, every day." },
      ]);
      expect(withoutFaqIds(page!.faqItems)).toEqual([
        { question: "Is this a real page?", answer: "Yes, entirely.", order: 0, source: "manual" },
      ]);
    });

    it("getPage returns null for a slug that doesn't exist, not an error", async () => {
      const adapter = harness.forGetPage(null);
      await expect(adapter.getPage("does-not-exist")).resolves.toBeNull();
    });

    it("getPage handles a page with every optional field missing or empty — no target keyword, no score, empty body, no FAQs", async () => {
      const adapter = harness.forGetPage(MINIMAL_PAGE);
      const page = await adapter.getPage(MINIMAL_PAGE.slug);

      expect(page).toMatchObject({
        targetKeyword: undefined,
        metaDescription: "",
        qualityScore: null,
      });
      expect(page!.contentBlocks).toEqual([]);
      expect(page!.faqItems).toEqual([]);
    });

    it("getPage handles a response missing optional metadata entirely (no custom fields set at all yet)", async () => {
      // Distinct from the previous case: this is a raw response shape with
      // the optional-fields CONTAINER itself absent (WordPress: no `meta`
      // key at all; Sanity's own projection always includes the key, so
      // toSanityPageDetail already covers this via MINIMAL_PAGE above) —
      // confirms each adapter's own `?? {}`/`?? null` fallback, not just the
      // common case of "present but empty."
      const adapter = harness.forGetPageMissingOptionalFields(MINIMAL_PAGE);
      const page = await adapter.getPage(MINIMAL_PAGE.slug);
      expect(page).toMatchObject({ targetKeyword: undefined, qualityScore: null, pageType: "other" });
    });

    it("createPage sends the input through and returns the full Page the CMS resolved it to (not just an echo of the input)", async () => {
      const adapter = harness.forCreatePage(UPDATED_PAGE);
      const page = await adapter.createPage(toCreatePageInput(FULL_PAGE));

      // The CMS's own re-fetched response is authoritative — this is
      // UPDATED_PAGE's title/score, deliberately different from the FULL_PAGE
      // input, to prove the adapter trusts what it got back over its input.
      expect(page.id).toBe(harness.idFor(UPDATED_PAGE.key));
      expect(page.title).toBe(UPDATED_PAGE.title);
      expect(page.qualityScore).toBe(UPDATED_PAGE.qualityScore);
    });

    it("updatePage returns the full, freshly re-fetched Page", async () => {
      const adapter = harness.forUpdatePage(UPDATED_PAGE);
      const page = await adapter.updatePage(harness.idFor(FULL_PAGE.key), { title: "New title" });

      expect(page.id).toBe(harness.idFor(UPDATED_PAGE.key));
      expect(page.title).toBe(UPDATED_PAGE.title);
    });

    it("listImages returns every image as an ImageAsset", async () => {
      const adapter = harness.forListImages([REVIEWED_IMAGE, MISSING_ALT_IMAGE]);
      const images = await adapter.listImages();

      expect(images).toHaveLength(2);
      const reviewed = images.find((img) => img.url === REVIEWED_IMAGE.url);
      const missing = images.find((img) => img.url === MISSING_ALT_IMAGE.url);
      expect(reviewed).toMatchObject({ altText: REVIEWED_IMAGE.altText, altTextStatus: "reviewed" });
      expect(missing).toMatchObject({ altText: null, altTextStatus: "missing" });
    });

    it("listImages returns an empty list for a site with no images yet, not an error", async () => {
      const adapter = harness.forListImages([]);
      await expect(adapter.listImages()).resolves.toEqual([]);
    });

    it("listImages filters by altTextStatus when asked", async () => {
      const adapter = harness.forListImages([REVIEWED_IMAGE, MISSING_ALT_IMAGE]);
      const images = await adapter.listImages({ altTextStatus: "missing" });
      expect(images).toHaveLength(1);
      expect(images[0].altTextStatus).toBe("missing");
    });

    it("updateImage returns the updated ImageAsset reflecting the new alt text", async () => {
      const updated = { ...REVIEWED_IMAGE, altText: "An updated description." };
      const adapter = harness.forUpdateImage(updated);
      const image = await adapter.updateImage(harness.mediaIdFor("image-1"), {
        altText: "An updated description.",
      });
      expect(image.altText).toBe("An updated description.");
    });
  });
}

// ---- Alt-text-status behavior: shared structure, adapter-specific outcome -
//
// Both adapters satisfy the same CmsAdapter contract here, but the actual
// *behavior* genuinely differs, and SPEC.md §24/§25 already documented why:
// Sanity models alt text per-usage (one imageBlock per embed, no separate
// attachment identity to disagree with itself), so there is no ambiguity to
// resolve. WordPress models it per-attachment with a real custom status
// field, but still falls back to deriving a status from `alt_text` presence
// alone for any attachment this app never wrote a status to. This is
// asserted explicitly below — not skipped — precisely because it's a real,
// documented difference a reviewer should be able to see proven, not just
// described in prose.
describe("alt-text-status: documented behavior (asserted, not skipped)", () => {
  it("Sanity: altTextStatus is read directly, one unambiguous value per usage — no derivation involved", async () => {
    const adapter = sanityHarness.forListImages([AI_GENERATED_IMAGE]);
    const images = await adapter.listImages();
    expect(images[0].altTextStatus).toBe("ai-generated");
  });

  it("WordPress: a real stored status (written by updateImage) is honored over presence-based guessing", async () => {
    const adapter = wordpressHarness.forListImages([AI_GENERATED_IMAGE]);
    const images = await adapter.listImages();
    // AI_GENERATED_IMAGE has non-empty alt text — a presence-only guess
    // would say "reviewed." The real stored `_ai_cms_alt_text_status` field
    // (toWpMedia always sets it) overrides that guess correctly.
    expect(images[0].altTextStatus).toBe("ai-generated");
  });

  it("WordPress's documented limitation: an attachment this app never wrote a status to falls back to deriving one from alt_text presence alone", async () => {
    // No real stored status — simulates media uploaded or alt-texted
    // directly in wp-admin, before this app ever touched it.
    const legacyMedia = {
      id: wpFx.wpMediaIdFor("image-1"),
      source_url: REVIEWED_IMAGE.url,
      alt_text: REVIEWED_IMAGE.altText ?? "",
      post: 0,
      date_gmt: "2026-01-01T00:00:00",
      modified_gmt: "2026-01-01T00:00:00",
      meta: {}, // no _ai_cms_alt_text_status at all
    };
    const adapter = new WordPressAdapter(
      wordpressSite,
      wpFx.makeWordPressClient({ get: vi.fn().mockResolvedValue([legacyMedia]) }),
    );
    const images = await adapter.listImages();
    // Non-empty alt_text with no real stored status derives to "reviewed" —
    // a reasonable guess ("a human wrote this directly"), but still a guess,
    // not a fact this app actually knows. This is the asymmetry Sanity's
    // per-usage model doesn't have at all.
    expect(images[0].altTextStatus).toBe("reviewed");
  });
});
