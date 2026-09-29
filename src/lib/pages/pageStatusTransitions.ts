import type { PageStatus } from "@/types";

export type PageStatusAction = "submit" | "approve" | "reject" | "publish";

// The whole review-workflow state machine (SPEC.md §18):
//
//   draft --submit--> in-review --approve--> approved --publish--> published
//                          ^                     |
//                          \---------reject-------/
//
// Publishing can only be reached by passing through "in-review" and
// "approved" in that order — there is no direct draft -> published or
// in-review -> published edge. That's deliberate (task item 5), not an
// oversight: the entire point of a review state is that nothing skips it on
// the way to being live. "reject" is one general "send it back to draft"
// action available from both in-review and approved, rather than two
// separately-named actions for what's the same intent either way.
//
// There is no back-edge out of "published" (an unpublish/revoke flow) —
// nothing in this task asked for one, and adding it speculatively would be
// designing for a requirement that doesn't exist yet.
const TRANSITIONS: Record<PageStatusAction, Partial<Record<PageStatus, PageStatus>>> = {
  submit: { draft: "in-review" },
  approve: { "in-review": "approved" },
  reject: { "in-review": "draft", approved: "draft" },
  publish: { approved: "published" },
};

export const PAGE_STATUS_ACTION_LABEL: Record<PageStatusAction, string> = {
  submit: "Submit for review",
  approve: "Approve",
  reject: "Reject",
  publish: "Publish",
};

// The single source of truth for "is this transition legal" — called both
// server-side (transitionPageStatusAction.ts, to actually enforce it) and
// client-side (PageStatusPanel.tsx, to decide which buttons to show at all).
export function resolvePageStatusTransition(
  action: PageStatusAction,
  current: PageStatus,
): PageStatus | null {
  return TRANSITIONS[action][current] ?? null;
}

export function availablePageStatusActions(current: PageStatus): PageStatusAction[] {
  return (Object.keys(TRANSITIONS) as PageStatusAction[]).filter(
    (action) => TRANSITIONS[action][current] !== undefined,
  );
}
