import { describe, expect, it } from 'vitest';
import { jobId, sentenceId } from '../shared/ids';
import { importedReadingFixture } from '../../../testing/persistence-fixtures';
import type { AssetJob, JobState } from './jobs';
import { isReady, missingLayers, schedulable, sentencesWithoutStoredAid } from './preparation';

const base = importedReadingFixture().reading;

function job(kind: AssetJob['kind'], state: JobState): AssetJob {
  return {
    id: jobId(`${kind}-${state}`),
    kind,
    state,
    readingId: base.id,
    orderedSentenceIds: [],
    completedSentenceIds: [],
    failedItems: [],
    configFingerprint: 'fingerprint',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('reading preparation', () => {
  it.each([
    [{ state: 'not-requested' } as const, ['grammar']],
    [{ state: 'partial', analyzedSentenceCount: 1, concernCount: 0 } as const, ['grammar']],
    [{ state: 'complete', concernCount: 0 } as const, []],
    [{ state: 'unavailable', reasonCode: 'provider-unavailable' } as const, []],
  ])('derives missing grammar from the %s summary', (grammarSummary, expected) => {
    expect(missingLayers({ ...base, preparationTargets: ['grammar'], grammarSummary })).toEqual(
      expected,
    );
  });

  it('is ready only when every declared target is satisfied', () => {
    const reading = {
      ...base,
      preparationTargets: ['english', 'audio'] as const,
      translationSummary: { total: 3, completed: 3, failed: 0 },
      audioSummary: { total: 3, completed: 2, failed: 0 },
    };

    expect(isReady(reading)).toBe(false);
    expect(isReady({ ...reading, audioSummary: { total: 3, completed: 3, failed: 0 } })).toBe(true);
  });

  it('orders non-terminal work and skips every terminal row', () => {
    const rows = [
      job('prepare-audio', 'queued'),
      job('analyze-reading', 'complete'),
      job('analyze-reading', 'paused'),
      job('translate-reading', 'running'),
      job('prepare-audio', 'failed'),
      job('translate-reading', 'cancelled'),
    ];

    expect(schedulable(rows).map((row) => row.kind)).toEqual([
      'translate-reading',
      'analyze-reading',
      'prepare-audio',
    ]);
  });

  describe('sentences without a stored aid', () => {
    const first = sentenceId('s1');
    const second = sentenceId('s2');
    const third = sentenceId('s3');

    it('reports every sentence when nothing has been prepared', () => {
      const keys = new Map([
        [first, 'key-a'],
        [second, 'key-b'],
      ]);

      expect(sentencesWithoutStoredAid(keys, [])).toEqual([first, second]);
    });

    it('treats a repeated sentence as prepared through the row of its twin', () => {
      const keys = new Map([
        [first, 'shared'],
        [second, 'shared'],
        [third, 'key-c'],
      ]);

      expect(sentencesWithoutStoredAid(keys, [second])).toEqual([third]);
    });

    it('still reports a repeat that would need its own row', () => {
      const keys = new Map([
        [first, 'key-a'],
        [second, 'key-b'],
      ]);

      expect(sentencesWithoutStoredAid(keys, [first])).toEqual([second]);
    });

    it('ignores a stored sentence that no longer belongs to the reading', () => {
      const keys = new Map([[first, 'key-a']]);

      expect(sentencesWithoutStoredAid(keys, [second])).toEqual([first]);
    });
  });
});
