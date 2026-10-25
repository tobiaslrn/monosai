import { describe, expect, it } from 'vitest';
import {
  EMPTY_STORY_DIRECTION,
  addCustomOption,
  rollPlotFrames,
  storyDirectionRecord,
} from '../../../domain/ai/story-direction';
import { generationProvenanceRowSchema } from './generation.schema';

const ROW = {
  v: 1,
  id: 'provenance-1',
  readingId: '00000000-0000-4000-8000-000000000001',
  snapshotId: '00000000-0000-4000-8000-000000000002',
  grammarProfileSnapshotId: 'profile',
  exceptionPolicyHash: '',
  modelId: 'vendor/text-model',
  promptVersions: { plots: 'plots/1', story: 'story/7' },
  requestedSentenceCount: 15,
  repairAttempts: 0,
  suggestedVocabularyItemIds: [],
  ankiWordPriorityMode: 'uniform',
  createdAt: 1_700_000_000_000,
};

function record() {
  const added = addCustomOption(EMPTY_STORY_DIRECTION, 'cast', 'My cat Mochi');
  if (!added.ok) throw new Error('fixture');
  const [frame] = rollPlotFrames(added.value, { nextInt: () => 0 });
  return storyDirectionRecord(added.value, frame, 'Edited plot.', 'Drafted plot.');
}

describe('generationProvenanceRowSchema story direction', () => {
  it('accepts a row written before plots existed', () => {
    expect(generationProvenanceRowSchema.safeParse(ROW).success).toBe(true);
  });

  it('keeps the whole record of a plot-drafted story through a round trip', () => {
    const storyDirection = record();
    const parsed = generationProvenanceRowSchema.safeParse({ ...ROW, storyDirection });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.storyDirection).toEqual(storyDirection);
  });

  it('measures a custom option in characters, as the form does', () => {
    const fits = { ...record(), selected: { cast: ['🐱'.repeat(40)] } };
    expect(generationProvenanceRowSchema.safeParse({ ...ROW, storyDirection: fits }).success).toBe(
      true,
    );
    const tooLong = { ...record(), selected: { cast: ['🐱'.repeat(41)] } };
    expect(
      generationProvenanceRowSchema.safeParse({ ...ROW, storyDirection: tooLong }).success,
    ).toBe(false);
  });

  it('refuses a record that is not one', () => {
    const storyDirection = record();
    for (const broken of [
      { ...storyDirection, plotEn: '' },
      { ...storyDirection, selected: { genre: ['a', 'b', 'c'] } },
      { ...storyDirection, frame: { mood: [{ value: 'Calm' }] } },
      { ...storyDirection, selected: { weather: ['Rain'] } },
    ]) {
      expect(
        generationProvenanceRowSchema.safeParse({ ...ROW, storyDirection: broken }).success,
      ).toBe(false);
    }
  });
});
