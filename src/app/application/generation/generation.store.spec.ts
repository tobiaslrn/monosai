import { beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import { err, ok } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import {
  configureGenerationTestBed,
  shortStory,
  story,
  storyWithUnknown,
  strictStory,
  type GenerationTestBed,
} from '../../../testing/generation-fakes';

const PREMISE = { premise: 'ねこが一日をすごす話。' };

const POLICY = 'Allow place names I mention in the premise.';

const APPROVAL = {
  candidateId: '図書館|図書館',
  decision: 'approved' as const,
  explanationEn: 'The premise names this place, and the policy allows places I name.',
};

const REJECTION = {
  candidateId: '図書館|図書館',
  decision: 'rejected' as const,
  explanationEn: 'The policy does not cover this word.',
};

describe('GenerationStore strict pass', () => {
  let bed: GenerationTestBed;

  beforeEach(() => {
    bed = configureGenerationTestBed();
  });

  it('saves a story every word of which is reviewed, in one provider call', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toEqual({
      story: 1,
      repair: 0,
      review: 0,
      grammar: 1,
      translate: 1,
    });
    const state = bed.store.state();
    expect(state.kind).toBe('saved');
    if (state.kind !== 'saved') {
      return;
    }
    expect(state.reading.kind).toBe('generated');
    expect(state.reading.title).toBe('ねこの一日');
    expect(state.reading.sentenceCount).toBe(5);
    expect(state.reading.validationOutcome).toEqual({ kind: 'strict' });
  });

  it('writes the text, the frozen validation, and the provenance together', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.readings.readings).toHaveLength(1);
    expect(bed.readings.paragraphs).toHaveLength(1);
    expect(bed.readings.sentences).toHaveLength(5);
    expect(bed.readings.tokenAnalyses).toHaveLength(5);
    expect(bed.readings.frozenValidations).toHaveLength(5);
    expect(bed.readings.provenance).toHaveLength(1);

    const provenance = bed.readings.provenance[0];
    expect(provenance.repairAttempts).toBe(0);
    expect(provenance.modelId).toBe('vendor/text-model');
    expect(provenance.promptVersions).toMatchObject({ story: 'story/1' });
    expect(provenance.grammarProfileSnapshotId.length).toBeGreaterThan(0);
    expect(provenance.suggestedVocabularyItemIds.length).toBeGreaterThan(0);
  });

  it('captures the selected priority mode in generation provenance', async () => {
    bed = configureGenerationTestBed({ ankiWordPriorityMode: 'difficult' });
    bed.provider.storyQueue.push(ok(strictStory()));
    const answerAuxiliary = bed.provider.beforeAnswer;
    bed.provider.beforeAnswer = () => {
      answerAuxiliary?.();
      if (bed.provider.storyRequests.length === 1) {
        bed.setPriorityMode('recent');
      }
    };

    await bed.store.generate(5, PREMISE);

    expect(bed.readings.provenance[0]?.ankiWordPriorityMode).toBe('difficult');
  });

  it('never stores an unknown category on an accepted story', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    const categories = bed.readings.frozenValidations.flatMap((validation) =>
      validation.tokenStatuses.map((status) => status.validation.category),
    );
    expect(categories).not.toContain('unknown');
    expect(categories).not.toContain('not-in-snapshot');
  });

  it('runs grammar review and translation before saving, and records the result', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    const state = bed.store.state();
    if (state.kind !== 'saved') {
      expect.unreachable('expected a saved story');
      return;
    }
    expect(state.reading.translationSummary).toEqual({ total: 5, completed: 5, failed: 0 });
    expect(state.reading.grammarSummary).toEqual({ state: 'complete', concernCount: 0 });
    expect(state.reading.audioSummary).toEqual({ total: 5, completed: 0, failed: 0 });
    expect(bed.readings.readings[0]).toMatchObject({
      translationSummary: { total: 5, completed: 5, failed: 0 },
      grammarSummary: { state: 'complete', concernCount: 0 },
    });
  });

  it('sends the whole reviewed allowlist and a hidden suggestion palette', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    const request = bed.provider.storyRequests[0];
    expect(request.allowedVocabulary).toContain('ねこ');
    expect(request.allowedVocabulary).toHaveLength(8);
    expect(request.suggestedVocabulary.length).toBeGreaterThan(0);
    expect(request.structuralBaseline).toContain('は');
    expect(request.sentenceRange).toEqual({ min: 5, max: 5 });
  });

  it('opens in the structured-output mode the stored test proved', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.configs[0]).toEqual({
      modelId: 'vendor/text-model',
      structuredOutput: 'native-schema',
      storyTokenBudget: 16_384,
    });
  });

  it('captures the configured story token budget before writing', async () => {
    bed = configureGenerationTestBed({ storyTokenBudget: 24_576 });
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.configs[0].storyTokenBudget).toBe(24_576);
  });
});

describe('GenerationStore exception review', () => {
  let bed: GenerationTestBed;

  beforeEach(() => {
    bed = configureGenerationTestBed();
  });

  it('saves an approved exception as visibly distinct, in two provider calls', async () => {
    await bed.setPolicy(POLICY);
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.reviewQueue.push(ok([APPROVAL]));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toEqual({
      story: 1,
      repair: 0,
      review: 1,
      grammar: 1,
      translate: 1,
    });
    const state = bed.store.state();
    expect(state.kind).toBe('saved');
    if (state.kind !== 'saved') {
      return;
    }
    expect(state.reading.validationOutcome).toEqual({ kind: 'exception', exceptionCount: 1 });

    const exceptions = bed.readings.frozenValidations
      .flatMap((validation) => validation.tokenStatuses)
      .filter((status) => status.validation.category === 'policy-exception');
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].validation).toMatchObject({ explanationEn: APPROVAL.explanationEn });
  });

  it('does not ask the policy when there is none configured', async () => {
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.repairQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toEqual({
      story: 1,
      repair: 1,
      review: 0,
      grammar: 1,
      translate: 1,
    });
  });

  it('repairs rather than accepting when the review itself fails', async () => {
    await bed.setPolicy(POLICY);
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.reviewQueue.push(
      err(aiError('provider-unavailable', 'exception-review', 'The provider is down.')),
    );
    bed.provider.repairQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toEqual({
      story: 1,
      repair: 1,
      review: 1,
      grammar: 1,
      translate: 1,
    });
    expect(bed.store.state().kind).toBe('saved');
    const categories = bed.readings.frozenValidations
      .flatMap((validation) => validation.tokenStatuses)
      .map((status) => status.validation.category);
    expect(categories).not.toContain('unknown');
  });

  it('discards a decision whose explanation only restates the verdict', async () => {
    await bed.setPolicy(POLICY);
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.reviewQueue.push(ok([{ ...APPROVAL, explanationEn: 'Allowed.' }]));
    bed.provider.repairQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls.repair).toBe(1);
    expect(bed.store.state().kind).toBe('saved');
  });
});

describe('GenerationStore repair', () => {
  let bed: GenerationTestBed;

  beforeEach(() => {
    bed = configureGenerationTestBed();
  });

  it('repairs a rejected unknown once and validates on a full reparse, in three calls', async () => {
    await bed.setPolicy(POLICY);
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.reviewQueue.push(ok([REJECTION]));
    bed.provider.repairQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toEqual({
      story: 1,
      repair: 1,
      review: 1,
      grammar: 1,
      translate: 1,
    });
    expect(bed.store.state().kind).toBe('saved');
    expect(bed.readings.provenance[0].repairAttempts).toBe(1);
  });

  it('repairs a story of the wrong length rather than treating it as malformed', async () => {
    bed.provider.storyQueue.push(ok(shortStory()));
    bed.provider.repairQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toEqual({
      story: 1,
      repair: 1,
      review: 0,
      grammar: 1,
      translate: 1,
    });
    expect(bed.provider.repairRequests[0].structureIssues[0].code).toBe(
      'sentence-count-out-of-range',
    );
    expect(bed.store.state().kind).toBe('saved');
  });

  it('tells the repair exactly which word must go, and where', async () => {
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.repairQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.repairRequests[0].unknownSpans).toEqual([
      {
        sentenceIndex: 1,
        surface: '図書館',
        reason: 'is not in the allowed vocabulary and was not approved by the exception policy.',
      },
    ]);
  });

  it('stops after two repairs and writes no rows at all', async () => {
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.repairQueue.push(ok(storyWithUnknown()), ok(storyWithUnknown()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toEqual({
      story: 1,
      repair: 2,
      review: 0,
      grammar: 0,
      translate: 0,
    });
    const state = bed.store.state();
    expect(state.kind).toBe('invalid-draft');
    if (state.kind !== 'invalid-draft') {
      return;
    }
    expect(state.draft.repairAttempts).toBe(2);
    expect(state.draft.sentences[1].unknownSurfaces).toEqual(['図書館']);
    expect(state.draft.issues).toContain('“図書館” is not in your reviewed vocabulary.');

    expect(bed.readings.readings).toHaveLength(0);
    expect(bed.readings.sentences).toHaveLength(0);
    expect(bed.readings.frozenValidations).toHaveLength(0);
    expect(bed.readings.provenance).toHaveLength(0);
  });

  it('offers no way out of an invalid draft except starting over', async () => {
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.repairQueue.push(ok(storyWithUnknown()), ok(storyWithUnknown()));

    await bed.store.generate(5, PREMISE);
    bed.store.reset();

    expect(bed.store.state().kind).toBe('idle');
    expect(bed.readings.readings).toHaveLength(0);
  });
});

describe('GenerationStore failures', () => {
  let bed: GenerationTestBed;

  beforeEach(() => {
    bed = configureGenerationTestBed();
  });

  it('reports a malformed reply the adapter could not recover and saves nothing', async () => {
    bed.provider.storyQueue.push(
      err(
        aiError('malformed-response', 'story-generation', 'Unusable shape.', {
          detail: { issueCode: 'story-shape' },
        }),
      ),
    );

    await bed.store.generate(5, PREMISE);

    const state = bed.store.state();
    expect(state.kind).toBe('failed');
    if (state.kind !== 'failed') {
      return;
    }
    expect(state.error.code).toBe('malformed-response');
    expect(bed.readings.readings).toHaveLength(0);
  });

  it('reports a hard model failure without repairing it', async () => {
    bed.provider.storyQueue.push(
      err(aiError('authentication', 'story-generation', 'The key was refused.')),
    );

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toEqual({
      story: 1,
      repair: 0,
      review: 0,
      grammar: 0,
      translate: 0,
    });
    const state = bed.store.state();
    expect(state.kind).toBe('failed');
    if (state.kind !== 'failed') {
      return;
    }
    expect(state.error.code).toBe('authentication');
    expect(bed.readings.readings).toHaveLength(0);
  });

  it('refuses to start without a proven structured-output mode', async () => {
    const untested = configureGenerationTestBed({ structuredOutput: null });

    await untested.store.generate(5, PREMISE);

    expect(untested.provider.generationCalls.story).toBe(0);
    const state = untested.store.state();
    expect(state.kind).toBe('failed');
    if (state.kind !== 'failed') {
      return;
    }
    expect(state.error.code).toBe('capability-unsupported');
  });

  it('refuses an empty premise before spending a request', async () => {
    await bed.store.generate(5, { premise: '   ' });

    expect(bed.provider.generationCalls.story).toBe(0);
    expect(bed.store.state().kind).toBe('failed');
  });

  it('keeps the library empty when the save transaction fails', async () => {
    bed.readings.failSaveGeneratedWith = storageError('quota', 'The device is out of space.');
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    const state = bed.store.state();
    expect(state.kind).toBe('failed');
    if (state.kind !== 'failed') {
      return;
    }
    expect(state.error.code).toBe('quota');
    expect(state.during).toBe('finalizing');
    expect(bed.readings.readings).toHaveLength(0);
    expect(bed.readings.translations).toHaveLength(0);
    expect(bed.readings.grammarAnalyses).toHaveLength(0);
  });
});

describe('GenerationStore auxiliary review', () => {
  let bed: GenerationTestBed;

  beforeEach(() => {
    bed = configureGenerationTestBed();
  });

  it('saves the story with an unavailable grammar summary when grammar review fails', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));
    bed.provider.grammarQueue.push(
      err(aiError('provider-unavailable', 'grammar-review', 'The provider is down.')),
    );

    await bed.store.generate(5, PREMISE);

    const state = bed.store.state();
    expect(state.kind).toBe('saved');
    if (state.kind !== 'saved') {
      return;
    }
    expect(state.reading.grammarSummary).toEqual({
      state: 'unavailable',
      reasonCode: 'provider-unavailable',
    });
    expect(state.reading.translationSummary).toEqual({ total: 5, completed: 5, failed: 0 });
    expect(bed.readings.grammarAnalyses).toHaveLength(0);
  });

  it('saves the story with an honest count when one translation batch fails', async () => {
    const sentences = Array.from({ length: 15 }, () => 'ねこがいます。');
    bed.provider.storyQueue.push(ok(story(sentences)));
    bed.provider.beforeAnswer = () => {
      if (bed.provider.grammarRequests.length > 0 && bed.provider.grammarQueue.length === 0) {
        bed.provider.grammarQueue.push(ok({ findings: [] }));
      }
      const translateCallIndex = bed.provider.translationRequests.length;
      if (translateCallIndex > 0 && bed.provider.translationQueue.length === 0) {
        if (translateCallIndex === 2) {
          bed.provider.translationQueue.push(
            err(aiError('provider-unavailable', 'translation', 'The provider is down.')),
          );
        } else {
          const request = bed.provider.translationRequests[translateCallIndex - 1];
          bed.provider.translationQueue.push(
            ok(
              request.sentences.map((sentence) => ({
                id: sentence.id,
                textEn: `EN: ${sentence.textJa}`,
              })),
            ),
          );
        }
      }
    };

    await bed.store.generate(15, PREMISE);

    expect(bed.provider.generationCalls.translate).toBe(2);
    const state = bed.store.state();
    expect(state.kind).toBe('saved');
    if (state.kind !== 'saved') {
      return;
    }
    expect(state.reading.translationSummary).toEqual({ total: 15, completed: 10, failed: 5 });
  });

  it('cancels during auxiliary review and saves nothing, not even a translation that already arrived', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));
    bed.provider.beforeAnswer = () => {
      if (bed.store.state().kind === 'auxiliary-review') {
        bed.store.cancel();
      }
    };

    await bed.store.generate(5, PREMISE);

    const state = bed.store.state();
    expect(state.kind).toBe('cancelled');
    if (state.kind !== 'cancelled') {
      return;
    }
    expect(state.during).toBe('auxiliary-review');
    expect(bed.readings.readings).toHaveLength(0);
    expect(bed.readings.translations).toHaveLength(0);
    expect(bed.readings.grammarAnalyses).toHaveLength(0);
  });

  it('retries a finalizing failure without spending another provider call', async () => {
    bed.readings.failSaveGeneratedWith = storageError('quota', 'The device is out of space.');
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.store.state().kind).toBe('failed');
    expect(bed.store.canRetrySave()).toBe(true);
    const callsBeforeRetry = { ...bed.provider.generationCalls };

    bed.readings.failSaveGeneratedWith = null;
    await bed.store.retrySave();

    expect(bed.provider.generationCalls).toEqual(callsBeforeRetry);
    const state = bed.store.state();
    expect(state.kind).toBe('saved');
    if (state.kind !== 'saved') {
      return;
    }
    expect(state.reading.translationSummary).toEqual({ total: 5, completed: 5, failed: 0 });
    expect(bed.store.canRetrySave()).toBe(false);
  });

  it('makes exactly one grammar call and one translation batch call per bounded group', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls.grammar).toBe(1);
    expect(bed.provider.generationCalls.translate).toBe(1);
    expect(bed.provider.grammarRequests[0].sentences).toHaveLength(5);
    expect(bed.provider.translationRequests[0].sentences).toHaveLength(5);
  });
});

describe('GenerationStore cancellation', () => {
  let bed: GenerationTestBed;

  beforeEach(() => {
    bed = configureGenerationTestBed();
  });

  async function expectCancelledWithNothingSaved(): Promise<void> {
    expect(bed.store.state().kind).toBe('cancelled');
    expect(bed.readings.readings).toHaveLength(0);
    expect(bed.readings.sentences).toHaveLength(0);
    expect(bed.readings.provenance).toHaveLength(0);
    await Promise.resolve();
  }

  it('cancels while prerequisites are still being captured', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    const run = bed.store.generate(5, PREMISE);
    expect(bed.store.canCancel()).toBe(true);
    bed.store.cancel();
    await run;

    expect(bed.provider.generationCalls.story).toBe(0);
    await expectCancelledWithNothingSaved();
  });

  it('cancels while the model is writing', async () => {
    bed.provider.beforeAnswer = () => {
      bed.store.cancel();
    };
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls.story).toBe(1);
    await expectCancelledWithNothingSaved();
  });

  it('cancels while the story is being validated locally', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));
    bed.runtime.beforeAnalyze = () => {
      bed.store.cancel();
    };

    await bed.store.generate(5, PREMISE);

    await expectCancelledWithNothingSaved();
  });

  it('cancels while the exception policy is being consulted', async () => {
    await bed.setPolicy(POLICY);
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.reviewQueue.push(ok([APPROVAL]));
    bed.provider.beforeAnswer = () => {
      if (bed.store.state().kind === 'exception-review') {
        bed.store.cancel();
      }
    };

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls.review).toBe(1);
    await expectCancelledWithNothingSaved();
  });

  it('cancels while a repair is in flight', async () => {
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.repairQueue.push(ok(strictStory()));
    bed.provider.beforeAnswer = () => {
      if (bed.store.state().kind === 'repairing') {
        bed.store.cancel();
      }
    };

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls.repair).toBe(1);
    await expectCancelledWithNothingSaved();
  });

  it('cannot be cancelled once the transaction has started', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.store.canCancel()).toBe(false);
    expect(bed.store.state().kind).toBe('saved');
  });
});
