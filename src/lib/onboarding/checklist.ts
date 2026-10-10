import type { PageStatus } from "@/types";

export interface ChecklistPageInput {
  qualityScore: number | null | undefined;
  faqCount: number;
  status: PageStatus;
}

export interface ChecklistItem {
  id: "connect-site" | "generate-page" | "seo-score" | "faqs" | "publish";
  label: string;
  done: boolean;
  href: string;
}

// First-time-user walkthrough checklist (Day 35) — every item's `done` comes
// from data this app already persists, never a separate "has the user seen
// this" flag: a flag can drift from reality (get set and never cleared, or
// never set for an account that reached the milestone some other way,
// e.g. seeded data); reading the real records can't drift, by construction.
//
// "Run SEO suggestions" (the task's own wording) has no durable signal to
// check — suggestions are deliberately never persisted (SPEC.md's "never
// auto-save" principle), so there's no row anywhere that says "this page had
// suggestions fetched." Using `qualityScore !== null` instead: every page
// that has gone through a real save already has one (`withQualityScoring`
// wraps every create/update), which is an honest, if looser, proxy for "a
// page here has actually been looked at as more than a bare draft" — not a
// perfect match for the task's literal wording, but a real, persisted signal
// rather than a synthetic flag invented just for this checklist.
// `hasSite` is a real parameter, not hardcoded `true`, even though the one
// call site (src/app/(app)/pages/page.tsx) only ever reaches this code after
// a Site is already confirmed connected (no Site redirects to /sites first)
// — keeping it explicit means this function is still honest read on its own,
// not secretly dependent on which route happened to call it.
export function buildGettingStartedChecklist(hasSite: boolean, pages: ChecklistPageInput[]): ChecklistItem[] {
  const hasPages = pages.length > 0;
  return [
    { id: "connect-site", label: "Connect a Site", done: hasSite, href: "/sites" },
    {
      id: "generate-page",
      label: "Generate or open a page",
      done: hasPages,
      href: hasPages ? "/pages" : "/pages/new",
    },
    {
      id: "seo-score",
      label: "Review a page's SEO checklist and quality score",
      done: pages.some((page) => typeof page.qualityScore === "number"),
      href: "/pages",
    },
    {
      id: "faqs",
      label: "Add FAQs to a page",
      done: pages.some((page) => page.faqCount > 0),
      href: "/pages",
    },
    {
      id: "publish",
      label: "Move a page to published",
      done: pages.some((page) => page.status === "published"),
      href: "/pages",
    },
  ];
}

export function isGettingStartedComplete(items: ChecklistItem[]): boolean {
  return items.every((item) => item.done);
}
