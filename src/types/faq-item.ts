export type FaqItemSource = "ai-generated" | "manual";

export interface FaqItem {
  id: string;
  pageId: string;
  question: string;
  answer: string;
  order: number;
  source: FaqItemSource;
}
