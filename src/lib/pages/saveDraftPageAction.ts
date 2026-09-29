"use server";

import { requireUser } from "@/lib/auth/dal";
import { getActiveSiteForCurrentUser, getAdapterForCurrentUser } from "@/lib/cms";
import { logPageActivity } from "@/lib/audit";
import { summarizeContentChange, type ContentSnapshot } from "./auditSummary";
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
//
// No `qualityScore` field here (nor `faqItems`, which an earlier version of
// this action needed only to compute one) — every createPage/updatePage call
// made through getAdapterForCurrentUser() now scores itself automatically
// (src/lib/quality/autoScore.ts, SPEC.md §11), computed from the adapter's
// own post-write Page rather than this action's input. Duplicating that
// computation here would be redundant work immediately overwritten by the
// adapter wrapper.
export interface SaveDraftPageInput {
  cmsDocumentId?: string;
  title: string;
  slug: string;
  metaDescription: string;
  targetKeyword: string | null;
  pageType: PageType;
  contentBlocks: ContentBlock[];
  // The last known persisted state, if the caller has one — SeoPanel always
  // does (the `page` prop it loaded with); GeneratePageForm's own first save
  // never does, since there's nothing persisted yet to diff against. Powers
  // the audit log's "what changed" summary (SPEC.md §18) via the same
  // diffing this app already uses to render DiffView (§17) — omitting it
  // just means a generic summary, never a validation error.
  previousContent?: ContentSnapshot;
  // Whether an AI suggestion (an applied SEO suggestion, a regenerated
  // block accepted into this draft) is part of what's being saved — the
  // caller derives this from its own state (e.g. SeoPanel compares the
  // final title/metaDescription against the last AI suggestions it
  // fetched) rather than this action trying to infer intent from the
  // content alone. Purely descriptive: never changes what gets saved, only
  // how the audit entry describes it (SPEC.md §18).
  viaAiSuggestion?: boolean;
}

export type SaveDraftPageResult = { page: Page } | { error: string };

export async function saveDraftPageAction(
  input: SaveDraftPageInput,
): Promise<SaveDraftPageResult> {
  const user = await requireUser();
  const site = await getActiveSiteForCurrentUser();

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

    if (site) {
      const pageId = page.cmsDocumentId ?? page.id;
      if (!input.cmsDocumentId) {
        await logPageActivity({
          pageId,
          siteId: site.id,
          userId: user.id,
          userEmail: user.email ?? undefined,
          action: "page-created",
          summary: "Page created as a draft.",
        });
      } else {
        const summary = input.previousContent
          ? summarizeContentChange(input.previousContent, {
              title: input.title,
              metaDescription: input.metaDescription,
              targetKeyword,
              contentBlocks: input.contentBlocks,
            })
          : "Page content updated.";
        if (summary) {
          await logPageActivity({
            pageId,
            siteId: site.id,
            userId: user.id,
            userEmail: user.email ?? undefined,
            action: "content-updated",
            summary: input.viaAiSuggestion ? `${summary} (includes an applied AI suggestion)` : summary,
          });
        }
      }
    }

    return { page };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save this page.",
    };
  }
}
