import { describe, expect, it } from 'vitest';
import { vocabularyItemId, vocabularySourceId } from '../shared/ids';
import { applyBrowseQuery, DEFAULT_BROWSE_QUERY, type BrowseQuery } from './vocabulary-browse';
import type { VocabularyEntry } from './vocabulary-repository';

const NOW = Date.UTC(2026, 8, 9, 12);
const DAY = 86_400_000;
const SOURCE_A = vocabularySourceId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const SOURCE_B = vocabularySourceId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

function entry(id: string, overrides: Partial<VocabularyEntry> = {}): VocabularyEntry {
  return {
    itemId: vocabularyItemId(`${id}0000-0000-4000-8000-000000000000`),
    visibleExpression: id,
    canonicalExpression: id,
    sourceIds: [SOURCE_A],
    ...overrides,
  };
}

function query(overrides: Partial<BrowseQuery>): BrowseQuery {
  return { ...DEFAULT_BROWSE_QUERY, ...overrides };
}

describe('applyBrowseQuery', () => {
  it('treats an empty or whitespace search as no search', () => {
    const entries = [entry('食べる'), entry('飲む')];

    expect(applyBrowseQuery(entries, query({ search: '   ' }), NOW)).toEqual(entries);
  });

  it('searches Japanese, kana readings, and stored English meanings', () => {
    const entries = [
      entry('食べる', { readingHiragana: 'たべる', meaning: 'eat' }),
      entry('飲む', { readingHiragana: 'のむ', meaning: 'drink' }),
    ];

    expect(
      applyBrowseQuery(entries, query({ search: 'たべる' }), NOW).map((item) => item.meaning),
    ).toEqual(['eat']);
    expect(
      applyBrowseQuery(entries, query({ search: 'DRINK' }), NOW).map((item) => item.meaning),
    ).toEqual(['drink']);
  });

  it('filters sources, narrow difficulty ranges, and keeps unknown difficulty in the full range', () => {
    const entries = [
      entry('easy', { fsrsDifficulty: 1, sourceIds: [SOURCE_A] }),
      entry('hard', { fsrsDifficulty: 10, sourceIds: [SOURCE_B] }),
      entry('unknown', { sourceIds: [SOURCE_B] }),
    ];

    expect(
      applyBrowseQuery(
        entries,
        query({ sourceId: SOURCE_B, difficulty: { min: 0, max: 100 } }),
        NOW,
      ).map((item) => item.visibleExpression),
    ).toEqual(['hard', 'unknown']);
    expect(
      applyBrowseQuery(entries, query({ difficulty: { min: 0, max: 50 } }), NOW).map(
        (item) => item.visibleExpression,
      ),
    ).toEqual(['easy']);
  });

  it('includes date-window boundaries and excludes entries just outside them', () => {
    const entries = [
      entry('inside-7', { firstReviewedAt: NOW - 7 * DAY }),
      entry('outside-7', { firstReviewedAt: NOW - 7 * DAY - 1 }),
      entry('inside-30', { firstReviewedAt: NOW - 30 * DAY }),
      entry('inside-90', { firstReviewedAt: NOW - 90 * DAY }),
    ];

    expect(
      applyBrowseQuery(entries, query({ firstStudied: 'last-7-days' }), NOW).map(
        (item) => item.visibleExpression,
      ),
    ).toEqual(['inside-7']);
    expect(
      applyBrowseQuery(entries, query({ firstStudied: 'last-30-days' }), NOW).map(
        (item) => item.visibleExpression,
      ),
    ).toEqual(['inside-7', 'outside-7', 'inside-30']);
    expect(
      applyBrowseQuery(entries, query({ firstStudied: 'last-90-days' }), NOW).map(
        (item) => item.visibleExpression,
      ),
    ).toEqual(['inside-7', 'outside-7', 'inside-30', 'inside-90']);
  });

  it('uses deterministic tie-breakers for every sort', () => {
    const entries = [
      entry('same-b', { canonicalExpression: 'same', firstReviewedAt: NOW, fsrsDifficulty: 5 }),
      entry('same-a', { canonicalExpression: 'same', firstReviewedAt: NOW, fsrsDifficulty: 5 }),
      entry('other', { canonicalExpression: 'other', firstReviewedAt: NOW, fsrsDifficulty: 5 }),
    ];

    for (const sort of [
      'first-studied-desc',
      'first-studied-asc',
      'difficulty-desc',
      'difficulty-asc',
      'expression',
    ] as const) {
      const first = applyBrowseQuery(entries, query({ sort }), NOW).map((item) => item.itemId);
      expect(applyBrowseQuery(entries, query({ sort }), NOW).map((item) => item.itemId)).toEqual(
        first,
      );
    }
    expect(
      applyBrowseQuery(entries, query({ sort: 'expression' }), NOW).map(
        (item) => item.visibleExpression,
      ),
    ).toEqual(['other', 'same-a', 'same-b']);
  });
});
