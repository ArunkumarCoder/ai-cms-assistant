export type CmsProvider = "sanity" | "wordpress";

export interface Site {
  id: string;
  name: string;
  cms: CmsProvider;
  sanityProjectId?: string;
  sanityDataset?: string;
  wordpressUrl?: string;
  createdAt: string;
  updatedAt: string;
}
