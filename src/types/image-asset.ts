export type AltTextStatus = "missing" | "ai-generated" | "reviewed";

export interface ImageAsset {
  id: string;
  siteId: string;
  cmsAssetId?: string;
  url: string;
  altText: string | null;
  altTextStatus: AltTextStatus;
  usedOnPageIds: string[];
  createdAt: string;
  updatedAt: string;
}
