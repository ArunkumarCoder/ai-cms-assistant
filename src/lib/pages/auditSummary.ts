import { computeArrayDiff, computeValueDiff } from "@/lib/diff";
import type { ContentBlock, FaqItem } from "@/types";

export interface ContentSnapshot {
  title: string;
  metaDescription: string;
  targetKeyword?: string;
  contentBlocks: ContentBlock[];
}

// Reuses the exact diffing primitives DiffView.tsx renders with (Day 21,
// SPEC.md §17) for a second purpose: computing "what changed" audit-log text
// generically, from before/after data, rather than requiring every caller
// to track and thread through its own description of what it just did.
// Returns `null` when nothing actually changed — a "Save" click that
// persists no real difference isn't a meaningful change worth logging.
export function summarizeContentChange(
  before: ContentSnapshot,
  after: ContentSnapshot,
): string | null {
  const parts: string[] = [];

  const changedFields: string[] = [];
  if (computeValueDiff("title", before.title, after.title).status === "changed") {
    changedFields.push("title");
  }
  if (
    computeValueDiff("metaDescription", before.metaDescription, after.metaDescription).status ===
    "changed"
  ) {
    changedFields.push("meta description");
  }
  if (
    computeValueDiff("targetKeyword", before.targetKeyword ?? "", after.targetKeyword ?? "")
      .status === "changed"
  ) {
    changedFields.push("target keyword");
  }
  if (changedFields.length > 0) {
    parts.push(`${changedFields.join(", ")} changed`);
  }

  const blockDiff = computeArrayDiff(before.contentBlocks, after.contentBlocks, (b) => b.id);
  const changedBlocks = blockDiff.filter((e) => e.status === "changed").length;
  const addedBlocks = blockDiff.filter((e) => e.status === "added").length;
  const removedBlocks = blockDiff.filter((e) => e.status === "removed").length;
  if (changedBlocks > 0) parts.push(`${changedBlocks} block${changedBlocks === 1 ? "" : "s"} changed`);
  if (addedBlocks > 0) parts.push(`${addedBlocks} block${addedBlocks === 1 ? "" : "s"} added`);
  if (removedBlocks > 0) parts.push(`${removedBlocks} block${removedBlocks === 1 ? "" : "s"} removed`);

  return parts.length > 0 ? parts.join("; ") : null;
}

export function summarizeFaqChange(before: FaqItem[], after: FaqItem[]): string | null {
  const diff = computeArrayDiff(
    before,
    after,
    (item) => item.id,
    (a, b) => a.question === b.question && a.answer === b.answer,
  );
  const changed = diff.filter((e) => e.status === "changed").length;
  const added = diff.filter((e) => e.status === "added").length;
  const removed = diff.filter((e) => e.status === "removed").length;

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} FAQ${added === 1 ? "" : "s"} added`);
  if (changed > 0) parts.push(`${changed} FAQ${changed === 1 ? "" : "s"} edited`);
  if (removed > 0) parts.push(`${removed} FAQ${removed === 1 ? "" : "s"} removed`);

  return parts.length > 0 ? parts.join("; ") : null;
}
