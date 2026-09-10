import { describe, expect, it } from 'vitest';
import { describeFirstSeen, selectRecentFocus, type FocusCandidate } from './recent-focus';

/** Local noon, so calendar-day arithmetic never straddles midnight by accident. */
const NOW = new Date(2026, 8, 10, 12, 0, 0).getTime();

function daysAgo(days: number, hour = 12): number {
  return new Date(2026, 8, 10 - days, hour, 0, 0).getTime();
}

function words(focus: readonly { expression: string }[]): readonly string[] {
  return focus.map((word) => word.expression);
}

describe('selectRecentFocus', () => {
  it('orders the newest first review first', () => {
    const candidates: FocusCandidate[] = [
      { expression: '古い', firstReviewedAt: daysAgo(300) },
      { expression: '新しい', firstReviewedAt: daysAgo(0) },
      { expression: '中', firstReviewedAt: daysAgo(20) },
    ];

    expect(words(selectRecentFocus(candidates, 50, NOW))).toEqual(['新しい', '中', '古い']);
  });

  it('breaks a same-day tie by the latest answer, then by the expression', () => {
    // AnkiDroid proves only the study day, so every word from one day shares
    // one instant and the order has to come from somewhere stable.
    const day = daysAgo(2, 4);
    const candidates: FocusCandidate[] = [
      { expression: 'う', firstReviewedAt: day },
      { expression: 'あ', firstReviewedAt: day },
      { expression: 'い', firstReviewedAt: day, lastReviewedAt: daysAgo(0) },
    ];

    expect(words(selectRecentFocus(candidates, 50, NOW))).toEqual(['い', 'あ', 'う']);
    expect(words(selectRecentFocus([...candidates].reverse(), 50, NOW))).toEqual([
      'い',
      'あ',
      'う',
    ]);
  });

  it('keeps only the requested number of words', () => {
    const candidates = Array.from({ length: 80 }, (_value, index) => ({
      expression: `語${String(index)}`,
      firstReviewedAt: daysAgo(index),
    }));

    const focus = selectRecentFocus(candidates, 25, NOW);

    expect(focus).toHaveLength(25);
    expect(focus[0]?.expression).toBe('語0');
    expect(focus[24]?.expression).toBe('語24');
  });

  it('returns every dated word when the size exceeds the snapshot', () => {
    const candidates = [
      { expression: '猫', firstReviewedAt: daysAgo(1) },
      { expression: '犬', firstReviewedAt: daysAgo(3) },
    ];

    expect(selectRecentFocus(candidates, 100, NOW)).toHaveLength(2);
  });

  it('leaves out words without a first review instead of guessing', () => {
    const candidates: FocusCandidate[] = [
      { expression: '日付なし', lastReviewedAt: daysAgo(0) },
      { expression: '壊れた', firstReviewedAt: Number.NaN },
      { expression: '猫', firstReviewedAt: daysAgo(5) },
    ];

    expect(words(selectRecentFocus(candidates, 50, NOW))).toEqual(['猫']);
  });

  it('is empty when no word carries a date', () => {
    // A snapshot synced before first reviews were recorded.
    expect(selectRecentFocus([{ expression: '猫' }, { expression: '犬' }], 50, NOW)).toEqual([]);
  });

  it('labels each word with its age', () => {
    expect(selectRecentFocus([{ expression: '猫', firstReviewedAt: daysAgo(1) }], 50, NOW)).toEqual(
      [{ expression: '猫', firstSeen: 'yesterday' }],
    );
  });
});

describe('describeFirstSeen', () => {
  it.each([
    [0, 'today'],
    [1, 'yesterday'],
    [2, '2 days ago'],
    [6, '6 days ago'],
    [7, '1 week ago'],
    [13, '1 week ago'],
    [14, '2 weeks ago'],
    [59, '8 weeks ago'],
    [60, '2 months ago'],
    [240, '8 months ago'],
  ])('calls %i days "%s"', (days, label) => {
    expect(describeFirstSeen(daysAgo(days), NOW)).toBe(label);
  });

  it('counts calendar days rather than elapsed hours', () => {
    const lateYesterday = new Date(2026, 8, 9, 23, 30).getTime();
    const earlyToday = new Date(2026, 8, 10, 0, 30).getTime();

    expect(describeFirstSeen(lateYesterday, earlyToday)).toBe('yesterday');
  });

  it('calls a date in the future today', () => {
    expect(describeFirstSeen(daysAgo(-3), NOW)).toBe('today');
  });
});
