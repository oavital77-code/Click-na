/**
 * Runs `fn` over `items` with at most `limit` in flight; a failure in one is
 * logged and never stops the others.
 *
 * The cron has a minute. Anything that walks every therapist or every
 * subscription and awaits a mail provider per row goes through here, so a slow
 * or failing row costs its own time and nobody else's.
 */
export async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (error) {
        console.error("[concurrency] item failed", error);
      }
    }
  });
  await Promise.all(workers);
}
