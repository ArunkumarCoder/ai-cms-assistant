import { describe, expect, it, vi } from "vitest";
import { runWithConcurrency } from "./concurrency";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("runWithConcurrency", () => {
  it("processes every item exactly once", async () => {
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      seen.push(item);
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("never runs more than `concurrency` workers at once", async () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    let inFlight = 0;
    let maxInFlight = 0;
    const gates = items.map(() => deferred<void>());

    const runPromise = runWithConcurrency(items, 3, async (item) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gates[item].promise;
      inFlight--;
    });

    // Let the pool's first wave start before releasing anything.
    await Promise.resolve();
    await Promise.resolve();
    expect(maxInFlight).toBeLessThanOrEqual(3);

    for (const gate of gates) gate.resolve();
    await runPromise;
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("keeps processing remaining items after one worker call rejects", async () => {
    const seen: number[] = [];
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runWithConcurrency([1, 2, 3], 1, async (item) => {
      if (item === 2) throw new Error("boom");
      seen.push(item);
    });

    expect(seen).toEqual([1, 3]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("handles an empty item list without hanging", async () => {
    await expect(runWithConcurrency([], 3, async () => {})).resolves.toBeUndefined();
  });

  it("caps effective concurrency to the item count", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    await runWithConcurrency([1, 2], 10, async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await Promise.resolve();
      concurrent--;
    });
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});
