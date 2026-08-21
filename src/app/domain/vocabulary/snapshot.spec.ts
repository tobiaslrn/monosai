import { describe, expect, it } from 'vitest';
import { snapshotId } from '../shared/ids';
import {
  GENERATION_SNAPSHOT_MINIMUM,
  meetsGenerationMinimum,
  type VocabularySnapshot,
} from './snapshot';

function snapshotWith(uniqueEntryCount: number): VocabularySnapshot {
  return {
    id: snapshotId('00000000-0000-4000-8000-000000000001'),
    createdAt: 0,
    status: 'complete',
    uniqueEntryCount,
    mappingIds: [],
    providerKinds: [],
    analyzerVersion: 'v1',
    normalizationVersion: 'v1',
    stats: {
      mappingsQueried: 0,
      reviewedEligibleNotes: 0,
      nonEmptyValues: 0,
      rejectedEmptyValues: 0,
      duplicateOccurrences: 0,
      uniqueExpressions: 0,
      providerWarnings: [],
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
