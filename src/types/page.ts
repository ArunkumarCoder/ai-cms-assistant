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
  createdAt: string;
  updatedAt: string;
}
