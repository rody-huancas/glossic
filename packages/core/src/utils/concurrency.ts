export const mapWithConcurrency = async <T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      
      cursor += 1;

      const item = items[index];

      if (item === undefined) continue;

      results[index] = await task(item);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
};
