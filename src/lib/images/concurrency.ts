// A small worker pool: at most `concurrency` calls to `worker` in flight at
// once, regardless of how many `items` there are. This is the batch queue's
// entire rate-limiting strategy against the vision provider (task item 6) —
// deliberately simple rather than a real token-bucket/backoff scheduler:
// with a small concurrency limit (2-3), even a 40-image batch never fires
// more than a couple of requests at once, and 429s within that are still
// caught and retried by ../ai/retry.ts's own exponential backoff. `worker`
// must never throw — every caller in this app (runGenerate, below) already
// resolves to a result object instead of rejecting, same convention as every
// Server Action's `{ data } | { error }` return — but a stray throw is still
// caught here so one unexpected bug can't take down the rest of the batch,
// matching this task's "a failure at #14 shouldn't stop the other 39."
export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    try {
      await worker(items[index], index);
    } catch (err) {
      console.error("Batch worker threw unexpectedly (item skipped):", err);
    }
    await runNext();
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, runNext));
}
