import { describe, expect, it } from 'vitest';
import type { Reading } from '../../domain/reading/reading';
import { readingId } from '../../domain/shared/ids';
import { groupLibraryReadings } from './library-date-groups';

function reading(id: string, createdAt: number): Reading {
  return {
    id: readingId(id),
    kind: 'imported',
    title: id,
    createdAt,
    updatedAt: createdAt,
    sentenceCount: 1,
    lastOpenedAt: null,
    characterCount: 10,
    excerpt: '',
    translationSummary: { total: 1, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total: 1, completed: 0, failed: 0 },
    preparationTargets: [],
    analyzerVersion: '1',
    importSource: 'paste',
    sourceTextHash: 'hash',
  };
}

function localDate(daysFromToday: number): number {
  return new Date(2026, 7, 22 + daysFromToday, 12).getTime();
}

describe('groupLibraryReadings', () => {
  it('uses calm relative-date sections and preserves newest-first order', () => {
    const groups = groupLibraryReadings(
      [
        reading('today-b', localDate(0)),
        reading('today-a', localDate(0) - 1_000),
        reading('yesterday', localDate(-1)),
        reading('recent', localDate(-6)),
        reading('old', localDate(-7)),
      ],
      localDate(0),
    );

    expect(groups.map((group) => group.label)).toEqual([
      'Today',
      'Yesterday',
      'Earlier this week',
      'Older',
    ]);
    expect(groups[0]?.readings.map((item) => item.title)).toEqual(['today-b', 'today-a']);
  });

  it('omits empty sections and treats a future clock-skewed item as today', () => {
    const groups = groupLibraryReadings([reading('future', localDate(1))], localDate(0));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('today');
  });
});
