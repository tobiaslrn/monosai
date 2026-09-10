import { describe, expect, it } from 'vitest';
import type { GenerationState } from '../../application/generation/generation.store';
import { generationWaitCopy } from './generation-wait.component';

describe('generationWaitCopy', () => {
  it('describes the main model request plainly', () => {
    expect(generationWaitCopy({ kind: 'writing' })).toEqual({
      key: 'writing',
      title: 'Generating your story',
      detail: '',
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
        totalAttempts: 2,
        unknownCount: 5,
        structureIssueCount: 0,
      }),
    ).toMatchObject({
      title: 'Replacing 5 unfamiliar words',
      detail: 'Repair 1 of 2',
    });
  });

  it('promises only the Japanese while the story is being saved', () => {
    const state: GenerationState = { kind: 'finalizing' };

    // Aids are no longer part of this wait: the lane produces them after the
    // story is in the library, so saying otherwise here would be a promise the
    // save does not keep.
    expect(generationWaitCopy(state)).toMatchObject({
      title: 'Saving your story',
      detail: '',
    });
  });
});
