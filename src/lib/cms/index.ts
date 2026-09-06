// CMS adapter interface (Sanity, later WordPress) lives here.
export type { CmsAdapter } from "./adapter";
export type {
  CreatePageInput,
  ImageListFilter,
  PageSummary,
  UpdateImageInput,
  UpdatePageInput,
} from "./types";
export { SanityAdapter } from "./sanityAdapter";
export type { SanityQueryClient } from "./sanityAdapter";
export {
  getAdapterForCurrentUser,
  NoSiteConnectedError,
  NotAuthenticatedError,
} from "./resolveAdapter";
