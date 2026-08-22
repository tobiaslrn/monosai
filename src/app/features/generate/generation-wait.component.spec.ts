import { describe, expect, it } from 'vitest';
import type { GenerationState } from '../../application/generation/generation.store';
import { generationWaitCopy } from './generation-wait.component';

describe('generationWaitCopy', () => {
  it('describes the main model request plainly', () => {
    expect(generationWaitCopy({ kind: 'writing' })).toEqual({
      key: 'writing',
      title: 'Generating your story',
      detail: 'The model is writing the Japanese. This is usually the longest step.',
    });
  });

  it('uses the real unfamiliar-word count during review and repair', () => {
    expect(generationWaitCopy({ kind: 'exception-review', candidateCount: 5 }).title).toBe(
      'Reviewing 5 unfamiliar words',
    );
    expect(
      generationWaitCopy({
        kind: 'repairing',
        attempt: 1,
        unknownCount: 5,
        structureIssueCount: 0,
      }),
    ).toMatchObject({
      title: 'Replacing 5 unfamiliar words',
      detail: 'Repair attempt 1 of 2. The revised story will be checked again.',
    });
  });

  it('says that grammar review and translation run together', () => {
    const state: GenerationState = {
      kind: 'auxiliary-review',
      grammar: { status: 'running' },
      translation: { status: 'running' },
    };

    expect(generationWaitCopy(state)).toMatchObject({
      title: 'Reviewing grammar and translating',
      detail: 'These two finishing checks are running at the same time.',
    });
  });
});
