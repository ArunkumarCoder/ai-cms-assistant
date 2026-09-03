// CMS adapter interface (Sanity, later WordPress) lives here. The Sanity
// implementation satisfying CmsAdapter is not built yet — that's next.
export type { CmsAdapter } from "./adapter";
export type {
  CreatePageInput,
  ImageListFilter,
  PageSummary,
  UpdateImageInput,
  UpdatePageInput,
} from "./types";
