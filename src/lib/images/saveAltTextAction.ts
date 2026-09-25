"use server";

import { requireUser } from "@/lib/auth/dal";
import { getAdapterForCurrentUser } from "@/lib/cms";
import type { ImageAsset } from "@/types";

// The only place a generated (or hand-written) alt text ever reaches Sanity —
// called once, when a human explicitly accepts a suggestion in the Media
// Library, never automatically from generateAltTextAction.ts.
//
// `edited` decides which of SPEC.md journey (c)'s two valid "done state"
// statuses this write sets ("every processed ImageAsset has altText
// populated and altTextStatus set to 'ai-generated' or 'reviewed'"):
// accepting the AI's suggestion byte-for-byte sets "ai-generated" (a human
// approved it, but didn't personally rewrite it — still worth a later
// second look, same spirit as altTextSchema's own `needsReview` hint);
// accepting an edited version sets "reviewed" (a human demonstrably read and
// changed it, the strongest signal this codebase has for "a person actually
// looked at this"). There is no third path that persists "ai-generated"
// before any human has seen the text at all — that would be the auto-save
// this task explicitly rules out.
export interface SaveAltTextInput {
  cmsAssetId: string;
  altText: string;
  edited: boolean;
}

export type SaveAltTextResult = { image: ImageAsset } | { error: string };

export async function saveAltTextAction(
  input: SaveAltTextInput,
): Promise<SaveAltTextResult> {
  await requireUser();

  const trimmed = input.altText.trim();
  if (!trimmed) {
    return { error: "Alt text can't be empty." };
  }

  try {
    const adapter = await getAdapterForCurrentUser();
    const image = await adapter.updateImage(input.cmsAssetId, {
      altText: trimmed,
      altTextStatus: input.edited ? "reviewed" : "ai-generated",
    });
    return { image };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save alt text.",
    };
  }
}
