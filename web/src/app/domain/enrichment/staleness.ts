/**
 * Picks the analysis a stored row set represents right now.
 *
 * A record whose cache key matches the current configuration wins outright,
 * even if an older row exists — the cache key already proves it is current.
 * Otherwise the newest record by `createdAt` is returned flagged stale, since
 * a stale-but-present analysis is more useful to show than nothing while a
 * fresh one is fetched. A tie on `createdAt` keeps the last one encountered in
 * `records`, so the caller's own ordering (typically insertion order) decides.
 */
export function chooseAnalysis<T extends { readonly cacheKey: string; readonly createdAt: number }>(
  records: readonly T[],
  currentKey: string,
): { readonly record: T; readonly stale: boolean } | null {
  if (records.length === 0) {
    return null;
  }

  const current = records.find((record) => record.cacheKey === currentKey);
  if (current !== undefined) {
    return { record: current, stale: false };
  }

  let [newest] = records;
  for (const record of records) {
    if (record.createdAt >= newest.createdAt) {
      newest = record;
    }
  }
  return { record: newest, stale: true };
}
