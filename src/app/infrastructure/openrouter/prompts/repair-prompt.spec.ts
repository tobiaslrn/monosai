import { describe, expect, it } from 'vitest';
import type { StoryGenerationRequest } from '../../../domain/ai/story-request';
import type { StoryRepairRequest } from '../../../domain/ai/text-generation-provider';
import { snapshotId } from '../../../domain/shared/ids';
import { buildRepairPrompt } from './repair-prompt';

const ORIGINAL: StoryGenerationRequest = {
  form: 'micro',
  requestedSentenceCount: 5,
  premise: 'ねこが一日をすごす話。',
  allowedVocabulary: ['ねこ', 'ねる'],
  suggestedVocabulary: ['ねこ'],
  structuralBaseline: ['は', 'が'],
  grammarGuidance: 'Write single short clauses.',
  registerPreference: 'either',
  snapshotId: snapshotId('00000000-0000-4000-8000-000000000001'),
  grammarProfileHash: 'profile-hash',
  promptVersion: 'story/1',
};

const CANDIDATE: StoryRepairRequest['candidate'] = {
  titleJa: 'ねこの一日',
  sentences: [{ index: 0, textJa: 'ねこがいます。' }],
};

describe('buildRepairPrompt', () => {
  it('omits learner style instructions when none were given', () => {
    const request: StoryRepairRequest = {
      original: ORIGINAL,
      candidate: CANDIDATE,
      unknownSpans: [{ sentenceIndex: null, surface: '図書館' }],
      structureIssues: [],
      attempt: 1,
      previouslyAttempted: [],
      promptVersion: 'repair/1',
    };

    const prompt = buildRepairPrompt(request);

    expect(prompt.user).not.toContain('learner style instructions');
    expect(prompt.user).toContain('"titleJa"');
  });

  it('includes learner style instructions and a sentence-indexed span when given', () => {
    const request: StoryRepairRequest = {
      original: { ...ORIGINAL, specialInstructions: 'Keep it playful.' },
      candidate: CANDIDATE,
      unknownSpans: [{ sentenceIndex: 2, surface: '図書館' }],
      structureIssues: [
        { code: 'non-contiguous-index', severity: 'format', message: 'missing index' },
      ],
      attempt: 2,
      previouslyAttempted: ['図書館'],
      promptVersion: 'repair/1',
    };

    const prompt = buildRepairPrompt(request);

    expect(prompt.user).toContain('learner style instructions');
    expect(prompt.user).toContain('Keep it playful.');
    expect(prompt.user).toContain('"sentenceIndex":2');
  });
});
