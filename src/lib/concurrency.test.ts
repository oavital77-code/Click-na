import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "@/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("never has more than `limit` items in flight, and visits every item once", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      seen.push(n);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBe(3);
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("a failure in one item is logged and the rest still run", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const done: number[] = [];
    await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      done.push(n);
    });
    expect(done.sort()).toEqual([1, 3]);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("copes with an empty list", async () => {
    await expect(mapWithConcurrency([], 3, async () => {})).resolves.toBeUndefined();
  });
});
