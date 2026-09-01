export interface SeoAuditSuggestion {
  id: string;
  category: string;
  message: string;
  applied: boolean;
}

export interface SeoAuditBreakdown {
  keywordUsage: number;
  metaTags: number;
  readability: number;
  headingStructure: number;
  internalLinking: number;
}

export interface SeoAudit {
  id: string;
  pageId: string;
  score: number;
  breakdown: SeoAuditBreakdown;
  suggestions: SeoAuditSuggestion[];
  createdAt: string;
}
