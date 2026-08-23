export type MutationBatchResult<T> = {
  failed: Array<{ error: unknown; item: T }>;
  succeeded: T[];
};

export async function runMutationBatch<T, TResult>(
  items: T[],
  mutate: (item: T) => Promise<TResult>,
  onProgress?: (completed: number, total: number) => void,
): Promise<MutationBatchResult<T> & { results: Array<PromiseSettledResult<TResult>> }> {
  let completed = 0;
  const results = await Promise.allSettled(
    items.map(async (item) => {
      try {
        return await mutate(item);
      } finally {
        completed += 1;
        onProgress?.(completed, items.length);
      }
    }),
  );
  const failed: Array<{ error: unknown; item: T }> = [];
  const succeeded: T[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") succeeded.push(items[index]);
    else failed.push({ error: result.reason, item: items[index] });
  });
  return { failed, results, succeeded };
}
