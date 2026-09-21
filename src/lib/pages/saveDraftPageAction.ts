"use server";

import { requireUser } from "@/lib/auth/dal";
import { getAdapterForCurrentUser } from "@/lib/cms";
import type { ContentBlock, Page, PageType } from "@/types";
import { slugify } from "./slugify";

// Persists the Generate Page draft through CmsAdapter — never a direct
// Sanity call from the UI layer. `cmsDocumentId` present means "refining an
// already-saved draft" (updatePage); absent means first save (createPage).
// `status` is deliberately omitted on create so SanityAdapter's own
// `data.status ?? "draft"` default (src/lib/cms/sanityAdapter.ts) is the one
// place that decision lives — SPEC.md §2's existing PageStatus already
// covers "clear draft/unpublished state distinct from published," so no new
// field was needed here (see SPEC.md §9).
export interface SaveDraftPageInput {
  cmsDocumentId?: string;
  title: string;
  slug: string;
  metaDescription: string;
  targetKeyword: string | null;
  pageType: PageType;
  contentBlocks: ContentBlock[];
}

export type SaveDraftPageResult = { page: Page } | { error: string };

export async function saveDraftPageAction(
  input: SaveDraftPageInput,
): Promise<SaveDraftPageResult> {
  await requireUser();

  // Re-sanitize as a safety net over whatever the user typed into the
  // (now-editable) slug field — assertValidSlug in sanityAdapter.ts throws on
  // anything outside its pattern, and the user's own edit isn't validated
  // client-side.
  const slug = slugify(input.slug || input.title);
  const targetKeyword = input.targetKeyword ?? undefined;

  try {
    const adapter = await getAdapterForCurrentUser();
    const page = input.cmsDocumentId
      ? await adapter.updatePage(input.cmsDocumentId, {
          title: input.title,
          slug,
          metaDescription: input.metaDescription,
          targetKeyword,
          pageType: input.pageType,
          contentBlocks: input.contentBlocks,
        })
      : await adapter.createPage({
          title: input.title,
          slug,
          metaDescription: input.metaDescription,
          targetKeyword,
          pageType: input.pageType,
          contentBlocks: input.contentBlocks,
        });
    return { page };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save this page.",
    };
  }
}
