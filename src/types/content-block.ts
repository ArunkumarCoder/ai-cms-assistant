export type ContentBlockType =
  "heading" | "paragraph" | "cta" | "image" | "faq-schema";

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  order: number;
  content: string;
  metadata?: Record<string, unknown>;
}
