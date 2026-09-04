import type { PageType, PageStatus } from "@/types";
import type { AltTextStatus, FaqItemSource } from "@/types";

export interface PageListItem {
  _id: string;
  title: string;
  slug: string;
  pageType: PageType;
  status: PageStatus;
  targetKeyword: string | null;
  qualityScore: number | null;
  metaDescription: string | null;
  faqCount: number;
  _createdAt: string;
  _updatedAt: string;
}

export interface PageFaqItem {
  _key: string;
  question: string;
  answer: string;
  source: FaqItemSource;
}

export interface PageSeo {
  metaTitle?: string;
  metaDescription?: string;
}

export interface PageBodyTextBlock {
  _type: "block";
  _key: string;
  style: string;
  markDefs: unknown[];
  children: {
    _type: "span";
    _key: string;
    text: string;
    marks: string[];
  }[];
}

export interface PageBodyImageBlock {
  _type: "imageBlock";
  _key: string;
  alt: string;
  altTextStatus: AltTextStatus;
  caption?: string;
  hotspot?: unknown;
  crop?: unknown;
  asset?: {
    _id: string;
    url: string;
    metadata?: {
      lqip?: string;
      dimensions?: { width: number; height: number };
    };
  };
}

export interface PageBodyCtaBlock {
  _type: "ctaBlock";
  _key: string;
  text: string;
  href: string;
  openInNewTab?: boolean;
}

export type PageBodyBlock = PageBodyTextBlock | PageBodyImageBlock | PageBodyCtaBlock;

// Raw shape of one row from PAGES_WITH_IMAGE_BLOCKS_QUERY — one page, its
// imageBlock array members. `asset` is only absent if the reference is
// broken (deleted asset); the adapter skips those rather than throwing.
export interface PageWithImageBlocks {
  _id: string;
  _createdAt: string;
  _updatedAt: string;
  images: {
    _key: string;
    alt: string | null;
    altTextStatus: AltTextStatus;
    asset?: { _id: string; url: string };
  }[];
}

export interface PageDetail {
  _id: string;
  title: string;
  slug: string;
  pageType: PageType;
  status: PageStatus;
  targetKeyword: string | null;
  qualityScore: number | null;
  seo: PageSeo | null;
  faqItems: PageFaqItem[] | null;
  body: PageBodyBlock[] | null;
  _createdAt: string;
  _updatedAt: string;
}
