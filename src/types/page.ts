import type { ContentBlock } from "./content-block";
import type { FaqItem } from "./faq-item";

export type PageType = "landing" | "blog" | "service" | "other";
export type PageStatus = "draft" | "in-review" | "published";

export interface Page {
  id: string;
  siteId: string;
  cmsDocumentId?: string;
  slug: string;
  title: string;
  metaDescription: string;
  targetKeyword?: string;
  pageType: PageType;
  status: PageStatus;
  contentBlocks: ContentBlock[];
  latestSeoAuditId?: string;
  faqItems: FaqItem[];
  // Denormalized snapshot of the latest SEO/quality score (SPEC.md §4) — a
  // real Sanity schema field the /pages UI already displayed before this
  // field existed here. Added Day 5 while implementing the Sanity adapter:
  // PageSummary/Page couldn't carry it at all until it was on this type.
  qualityScore: number | null;
  createdAt: string;
  updatedAt: string;
}
