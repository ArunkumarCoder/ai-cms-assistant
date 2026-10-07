// CMS adapter interface (Sanity, WordPress) lives here.
export type { CmsAdapter } from "./adapter";
export { CmsAdapterError } from "./errors";
export type { CmsAdapterErrorKind } from "./errors";
export type {
  CreatePageInput,
  ImageListFilter,
  PageSummary,
  UpdateImageInput,
  UpdatePageInput,
} from "./types";
export { SanityAdapter } from "./sanityAdapter";
export type { SanityQueryClient } from "./sanityAdapter";
export { WordPressAdapter, WordPressApiError } from "./wordpressAdapter";
export type { WordPressApiClient } from "./wordpressAdapter";
export {
  getActiveSiteForCurrentUser,
  getAdapterForCurrentUser,
  NoSiteConnectedError,
  NotAuthenticatedError,
} from "./resolveAdapter";
