import type { Reading } from '../../domain/reading/reading';

export type LibraryDateGroupKey = 'today' | 'yesterday' | 'earlier-this-week' | 'older';

export interface LibraryDateGroup {
  readonly key: LibraryDateGroupKey;
  readonly label: string;
  readonly readings: readonly Reading[];
}

const GROUPS: readonly Omit<LibraryDateGroup, 'readings'>[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'earlier-this-week', label: 'Earlier this week' },
  { key: 'older', label: 'Older' },
];

const DAYS_IN_EARLIER_GROUP = 6;

/** Groups an already newest-first library page without changing its order. */
export function groupLibraryReadings(
  readings: readonly Reading[],
  now: number,
): readonly LibraryDateGroup[] {
  const grouped = new Map<LibraryDateGroupKey, Reading[]>();
  const today = localDayNumber(now);

  for (const reading of readings) {
    const daysAgo = today - localDayNumber(reading.createdAt);
    const key = groupKey(daysAgo);
    const group = grouped.get(key) ?? [];
    group.push(reading);
    grouped.set(key, group);
  }

  return GROUPS.flatMap((group) => {
    const groupReadings = grouped.get(group.key);
    return groupReadings === undefined ? [] : [{ ...group, readings: groupReadings }];
  });
}

function groupKey(daysAgo: number): LibraryDateGroupKey {
  if (daysAgo <= 0) {
    return 'today';
  }
  if (daysAgo === 1) {
    return 'yesterday';
  }
  return daysAgo <= DAYS_IN_EARLIER_GROUP ? 'earlier-this-week' : 'older';
}

/** Calendar-day arithmetic via UTC avoids 23/25-hour daylight-saving days. */
function localDayNumber(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}
