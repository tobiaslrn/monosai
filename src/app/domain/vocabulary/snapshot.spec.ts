import { describe, expect, it } from 'vitest';
import { snapshotId } from '../shared/ids';
import {
  GENERATION_SNAPSHOT_MINIMUM,
  meetsGenerationMinimum,
  vocabularyAvailability,
  type VocabularySnapshot,
} from './snapshot';

function snapshotWith(uniqueEntryCount: number): VocabularySnapshot {
  return {
    id: snapshotId('00000000-0000-4000-8000-000000000001'),
    createdAt: 0,
    status: 'complete',
    uniqueEntryCount,
    sourceIds: [],
    sourceKinds: [],
    analyzerVersion: 'v1',
    normalizationVersion: 'v1',
    stats: {
      sourcesQueried: 0,
      entriesRead: 0,
      nonEmptyValues: 0,
      rejectedEmptyValues: 0,
      duplicateOccurrences: 0,
      uniqueExpressions: 0,
      sourceWarnings: [],
    },
  };
}

describe('meetsGenerationMinimum', () => {
  it('is false when there is no snapshot', () => {
    expect(meetsGenerationMinimum(null)).toBe(false);
  });

  it('is false below the minimum', () => {
    expect(meetsGenerationMinimum(snapshotWith(GENERATION_SNAPSHOT_MINIMUM - 1))).toBe(false);
  });

  it('is true at and above the minimum', () => {
    expect(meetsGenerationMinimum(snapshotWith(GENERATION_SNAPSHOT_MINIMUM))).toBe(true);
  });
});

/**
 * An empty snapshot is not the same as no snapshot.
 *
 * With none, nothing is marked; with an empty one, everything is. The reader
 * has to be able to tell the learner which of the two it is looking at.
 */
describe('vocabularyAvailability', () => {
  it('reports no vocabulary at all when nothing is active', () => {
    expect(vocabularyAvailability(null)).toBe('none');
  });

  it('reports an active snapshot with no words as empty', () => {
    expect(vocabularyAvailability(snapshotWith(0))).toBe('empty');
  });

  it('reports a snapshot with words as ready', () => {
    expect(vocabularyAvailability(snapshotWith(1))).toBe('ready');
  });
});
