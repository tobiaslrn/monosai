import { describe, expect, it } from 'vitest';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import { snapshotId } from '../../domain/shared/ids';
import {
  generationShortfallLabel,
  vocabularyCountLabel,
  vocabularyProvenanceLabel,
  vocabularySourceSummary,
  vocabularySyncedLabel,
} from './vocabulary-standing';

const NOON = new Date(2026, 7, 21, 12, 0, 0).getTime();

function snapshotOf(overrides: Partial<VocabularySnapshot>): VocabularySnapshot {
  return {
    id: snapshotId('snapshot-1'),
    createdAt: NOON,
    status: 'complete',
    uniqueEntryCount: 340,
    sourceIds: [],
    sourceKinds: ['anki-connect'],
    analyzerVersion: '1',
    normalizationVersion: '1',
    stats: {
      sourcesQueried: 1,
      entriesRead: 340,
      nonEmptyValues: 340,
      rejectedEmptyValues: 0,
      duplicateOccurrences: 0,
      uniqueExpressions: 340,
      sourceWarnings: [],
    },
    ...overrides,
  };
}

describe('vocabularyCountLabel', () => {
  it('groups the count and keeps the singular for exactly one', () => {
    expect(vocabularyCountLabel(3_118)).toBe('3,118 words');
    expect(vocabularyCountLabel(1)).toBe('1 word');
    expect(vocabularyCountLabel(0)).toBe('0 words');
  });
});

describe('vocabularySourceSummary', () => {
  it('names a source the way a learner would, not the way the provider does', () => {
    expect(vocabularySourceSummary(['anki-connect'])).toBe('Anki');
    expect(vocabularySourceSummary(['anki-package'])).toBe('Anki package');
    expect(vocabularySourceSummary(['text-list'])).toBe('Pasted list');
  });

  it('collapses repeats and joins the rest', () => {
    expect(vocabularySourceSummary(['anki-connect', 'anki-connect', 'text-list'])).toBe(
      'Anki + Pasted list',
    );
  });

  /** A snapshot that recorded no kind still has to say something truthful. */
  it('says the source was not recorded rather than nothing', () => {
    expect(vocabularySourceSummary([])).toBe('an unrecorded source');
  });
});

describe('vocabularySyncedLabel', () => {
  it('counts days in words and falls back to a date', () => {
    expect(vocabularySyncedLabel(NOON, NOON)).toBe('synced today');
    expect(vocabularySyncedLabel(new Date(2026, 7, 18, 9, 0, 0).getTime(), NOON)).toBe(
      'synced 3 days ago',
    );
    expect(vocabularySyncedLabel(new Date(2026, 0, 4, 9, 0, 0).getTime(), NOON)).toBe(
      'synced Jan 4, 2026',
    );
  });
});

describe('vocabularyProvenanceLabel', () => {
  it('states where the words came from and how current they are', () => {
    expect(vocabularyProvenanceLabel(snapshotOf({}), NOON)).toBe('From Anki · synced today');
  });
});

describe('generationShortfallLabel', () => {
  it('names the floor while the learner is below it', () => {
    expect(generationShortfallLabel(12)).toBe('Stories are written from at least 50 words.');
    expect(generationShortfallLabel(49)).not.toBeNull();
  });

  /** Nothing congratulates anyone for passing a threshold they never saw. */
  it('says nothing once there are enough words', () => {
    expect(generationShortfallLabel(50)).toBeNull();
    expect(generationShortfallLabel(340)).toBeNull();
  });
});
