import type { PageStatus, PageType } from "@/types";

// A CMS-agnostic description of "a page" / "an image" that both
// sanityFixtures.ts and wordpressFixtures.ts know how to render into their
// own CMS's native raw shape (Sanity's PageDetail/PageListItem, WordPress's
// WpPage/WpMedia). adapterContract.test.ts feeds the SAME canonical fixture
// into both converters so its test bodies can assert both adapters produce
// the same resulting domain object — this is what makes the suite "shared"
// rather than two parallel copies of the same assertions.
//
// Deliberately only `heading`/`paragraph` content blocks: both converters
// can render these losslessly in their own CMS's format, which keeps the
// shared assertions exact. `cta`/`image` blocks exist in real content too,
// but their round-trip fidelity is already covered by each adapter's own
// existing test file (sanityAdapter.test.ts / wordpressAdapter.test.ts) —
// this suite is about the *contract* both adapters satisfy, not re-proving
// each one's own content-translation details a second time.
export type CanonicalBlock =
  | { type: "heading"; content: string; level: 2 | 3 | 4 }
  | { type: "paragraph"; content: string };

export interface CanonicalPage {
  // Stable identifier each fixture converter derives its own CMS-native id
  // from (Sanity: used directly as `_id`; WordPress: looked up in a fixed
  // key->numeric-id table, since WordPress ids are always numbers) — lets
  // shared test assertions refer to "this page" without hardcoding an id
  // shape only one of the two CMSs could actually produce.
  key: string;
  slug: string;
  title: string;
  metaDescription: string;
  targetKeyword?: string;
  pageType: PageType;
  status: PageStatus;
  qualityScore: number | null;
  contentBlocks: CanonicalBlock[];
  faqItems: { question: string; answer: string }[];
  createdAt: string;
  updatedAt: string;
}

// Every optional field filled in, non-empty collections — the "happy path"
// shape most hand-written tests reach for by default.
export const FULL_PAGE: CanonicalPage = {
  key: "full-page",
  slug: "full-page",
  title: "A Complete Landing Page",
  metaDescription: "Everything filled in: SEO description, a target keyword, FAQs, a real score.",
  targetKeyword: "complete landing page example",
  pageType: "landing",
  status: "published",
  qualityScore: 82,
  contentBlocks: [
    { type: "heading", content: "Welcome to Our Service", level: 2 },
    { type: "paragraph", content: "We solve real problems for real customers, every day." },
  ],
  faqItems: [{ question: "Is this a real page?", answer: "Yes, entirely." }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

// Every optional field absent/empty — the shape a page gets the moment it's
// created and nothing has touched it since: no target keyword, no score yet,
// no body content, no FAQs. Exercises each adapter's own "unset" handling
// (Sanity: `null`/`undefined` fields; WordPress: an empty or absent custom
// meta value) rather than assuming every fixture looks like the happy path.
export const MINIMAL_PAGE: CanonicalPage = {
  key: "minimal-page",
  slug: "minimal-page",
  title: "A Draft With Nothing Filled In Yet",
  metaDescription: "",
  targetKeyword: undefined,
  pageType: "other",
  status: "draft",
  qualityScore: null,
  contentBlocks: [],
  faqItems: [],
  createdAt: "2026-01-03T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

// A distinct identity from FULL_PAGE for update-scenario tests — "the page
// createPage/updatePage resolves to after the CMS's own re-fetch," not the
// same object the input was built from, since a real CMS is free to
// normalize fields and the adapter must trust its response over its input
// (CmsAdapter design note, adapter.ts).
export const UPDATED_PAGE: CanonicalPage = {
  ...FULL_PAGE,
  key: "updated-page",
  slug: "updated-page",
  title: "A Freshly Updated Page",
  qualityScore: 91,
};

export interface CanonicalImage {
  key: string;
  url: string;
  altText: string | null;
  altTextStatus: "missing" | "ai-generated" | "reviewed";
}

export const REVIEWED_IMAGE: CanonicalImage = {
  key: "image-1",
  url: "https://cdn.example.com/dashboard.png",
  altText: "A dashboard showing real-time analytics.",
  altTextStatus: "reviewed",
};

export const MISSING_ALT_IMAGE: CanonicalImage = {
  key: "image-2",
  url: "https://cdn.example.com/screenshot.png",
  altText: null,
  altTextStatus: "missing",
};

// Only representable on WordPress (SPEC.md §24/§25's documented gap): an
// image whose real per-attachment status was explicitly recorded as
// "ai-generated" — not derivable from alt-text presence alone, which is
// exactly why Sanity's per-usage model has no equivalent ambiguity to
// demonstrate here. See adapterContract.test.ts's alt-text-status section.
export const AI_GENERATED_IMAGE: CanonicalImage = {
  key: "image-3",
  url: "https://cdn.example.com/hero.png",
  altText: "A hero banner for the homepage.",
  altTextStatus: "ai-generated",
};
