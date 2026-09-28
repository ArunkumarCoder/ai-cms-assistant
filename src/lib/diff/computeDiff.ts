export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface DiffEntry<T> {
  id: string;
  status: DiffStatus;
  before: T | null;
  after: T | null;
}

// The one diffing primitive behind every AI-edit review surface in this app
// (block regeneration, applied SEO suggestions, and — per this task's own
// framing — whatever future AI edit to existing content comes next). Matches
// `before` and `after` items by id rather than position, so a block that
// simply moved wouldn't spuriously read as removed-then-added (nothing in
// this app reorders blocks as a side effect of an AI edit today, but the
// matching-by-id design costs nothing and is the correct behavior if that
// ever changes). Order: `before`'s own order first, then any new ids from
// `after` appended at the position they first appear there — good enough for
// content that only ever grows or changes in place, never reshuffles.
export function computeArrayDiff<T>(
  before: readonly T[],
  after: readonly T[],
  getId: (item: T) => string,
  isEqual: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
): DiffEntry<T>[] {
  const beforeById = new Map(before.map((item) => [getId(item), item]));
  const afterById = new Map(after.map((item) => [getId(item), item]));

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const item of before) {
    const id = getId(item);
    if (!seen.has(id)) {
      orderedIds.push(id);
      seen.add(id);
    }
  }
  for (const item of after) {
    const id = getId(item);
    if (!seen.has(id)) {
      orderedIds.push(id);
      seen.add(id);
    }
  }

  return orderedIds.map((id) => {
    const beforeItem = beforeById.get(id) ?? null;
    const afterItem = afterById.get(id) ?? null;

    let status: DiffStatus;
    if (beforeItem !== null && afterItem === null) status = "removed";
    else if (beforeItem === null && afterItem !== null) status = "added";
    else if (beforeItem !== null && afterItem !== null && !isEqual(beforeItem, afterItem)) status = "changed";
    else status = "unchanged";

    return { id, status, before: beforeItem, after: afterItem };
  });
}

// A single before/after value (a regenerated block, a suggested title) is
// the same diff as a one-element array on both sides — expressed as a thin
// wrapper over computeArrayDiff rather than a second algorithm, so both
// today's call sites (single-block regeneration, single-field SEO
// suggestions) and any future multi-block diff share one implementation.
export function computeValueDiff<T>(
  id: string,
  before: T,
  after: T,
  isEqual: (a: T, b: T) => boolean = (a, b) => a === b,
): DiffEntry<T> {
  return computeArrayDiff([before], [after], () => id, isEqual)[0];
}
