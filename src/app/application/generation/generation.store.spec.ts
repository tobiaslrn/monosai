import { beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import { err, ok } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import {
  configureGenerationTestBed,
  shortStory,
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
      grammar: 0,
      translate: 0,
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
    expect(provenance.requestedSentenceCount).toBe(5);
    expect(provenance.repairAttempts).toBe(0);
    expect(provenance.modelId).toBe('vendor/text-model');
    expect(provenance.promptVersions).toMatchObject({ story: 'story/3' });
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

  it('saves the Japanese and claims no aid it has not produced', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    const state = bed.store.state();
    if (state.kind !== 'saved') {
      expect.unreachable('expected a saved story');
      return;
    }
    expect(state.reading.translationSummary).toEqual({ total: 5, completed: 0, failed: 0 });
    expect(state.reading.grammarSummary).toEqual({ state: 'not-requested' });
    expect(state.reading.audioSummary).toEqual({ total: 5, completed: 0, failed: 0 });
    expect(state.reading.preparationTargets).toEqual(['english', 'grammar']);
  });

  it('sends the whole reviewed allowlist and a hidden suggestion palette', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    const request = bed.provider.storyRequests[0];
    expect(request.allowedVocabulary).toContain('ねこ');
    expect(request.allowedVocabulary).toHaveLength(9);
    expect(request.suggestedVocabulary.length).toBeGreaterThan(0);
    expect(request.structuralBaseline).toContain('は');
    expect(request.requestedSentenceCount).toBe(5);
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
      grammar: 0,
      translate: 0,
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
      grammar: 0,
      translate: 0,
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
      grammar: 0,
      translate: 0,
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
      grammar: 0,
      translate: 0,
    });
    expect(bed.store.state().kind).toBe('saved');
    expect(bed.readings.provenance[0].repairAttempts).toBe(1);
  });

  it('saves the story declaring the aid layers chosen when it started', async () => {
    bed = configureGenerationTestBed({ defaultPreparationTargets: ['english', 'audio'] });
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.store.state().kind).toBe('saved');
    expect(bed.readings.readings[0].preparationTargets).toEqual(['english', 'audio']);
  });

  it('does not ask the policy twice about a word it already refused', async () => {
    bed = configureGenerationTestBed({ vocabularyStrictness: 'strict' });
    await bed.setPolicy(POLICY);
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.reviewQueue.push(ok([REJECTION]));
    // Both repairs leave the same word in place, so it is a candidate again on
    // every pass — but the policy's answer cannot have changed.
    bed.provider.repairQueue.push(ok(storyWithUnknown()), ok(storyWithUnknown()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toMatchObject({ repair: 2, review: 1 });
    expect(bed.store.state().kind).toBe('saved');
  });

  it('asks again about a word whose review never got an answer', async () => {
    bed = configureGenerationTestBed({ vocabularyStrictness: 'strict' });
    await bed.setPolicy(POLICY);
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    // A failed review settles nothing, so every pass has to ask again.
    const unavailable = () =>
      err(aiError('provider-unavailable', 'exception-review', 'The provider is down.'));
    bed.provider.reviewQueue.push(unavailable(), unavailable(), unavailable());
    bed.provider.repairQueue.push(ok(storyWithUnknown()), ok(storyWithUnknown()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toMatchObject({ repair: 2, review: 3 });
  });

  it('saves a short story without spending a count repair', async () => {
    bed.provider.storyQueue.push(ok(shortStory()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toEqual({
      story: 1,
      repair: 0,
      review: 0,
      grammar: 0,
      translate: 0,
    });
    expect(bed.store.state().kind).toBe('saved');
  });

  it('tells the repair exactly which word must go, and where', async () => {
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.repairQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    // The reason is stated once by the repair prompt, not repeated per span.
    expect(bed.provider.repairRequests[0].unknownSpans).toEqual([
      { sentenceIndex: 1, surface: '図書館' },
    ]);
    expect(bed.provider.repairRequests[0].previouslyAttempted).toEqual([]);
  });

  it('names a surface an earlier repair already failed to remove', async () => {
    bed = configureGenerationTestBed({ vocabularyStrictness: 'strict' });
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.repairQueue.push(ok(storyWithUnknown()), ok(storyWithUnknown()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.repairRequests[0].previouslyAttempted).toEqual([]);
    expect(bed.provider.repairRequests[1].previouslyAttempted).toEqual(['図書館']);
  });

  it('saves the story after two repairs, with the words they could not replace marked', async () => {
    bed = configureGenerationTestBed({ vocabularyStrictness: 'strict' });
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
    expect(bed.store.state().kind).toBe('saved');
    expect(bed.readings.provenance[0].repairAttempts).toBe(2);

    const unknown = bed.readings.frozenValidations
      .flatMap((validation) => validation.tokenStatuses)
      .filter((status) => status.validation.category === 'unknown');
    expect(unknown).not.toHaveLength(0);
    expect(unknown[0].validation).toEqual({
      category: 'unknown',
      reason: 'unresolved-after-repair',
    });
  });

  it('saves the first draft without a repair in relaxed mode', async () => {
    bed = configureGenerationTestBed({ vocabularyStrictness: 'relaxed' });
    bed.provider.storyQueue.push(ok(storyWithUnknown()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toMatchObject({ story: 1, repair: 0 });
    expect(bed.store.state().kind).toBe('saved');
    expect(bed.readings.provenance[0].repairAttempts).toBe(0);
  });

  it('spends one repair in standard mode, then saves remaining unfamiliar words', async () => {
    bed.provider.storyQueue.push(ok(storyWithUnknown()));
    bed.provider.repairQueue.push(ok(storyWithUnknown()));

    await bed.store.generate(5, PREMISE);

    expect(bed.provider.generationCalls).toMatchObject({ story: 1, repair: 1 });
    expect(bed.store.state().kind).toBe('saved');
    expect(bed.readings.provenance[0].repairAttempts).toBe(1);
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
  });
});

describe('GenerationStore after acceptance', () => {
  let bed: GenerationTestBed;

  beforeEach(() => {
    bed = configureGenerationTestBed();
  });

  it('saves without asking for a grammar review or a translation', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));

    await bed.store.generate(5, PREMISE);

    // The lane owns both layers now (ADR 0048), so acceptance is followed by
    // the save and by nothing else the learner pays for.
    expect(bed.provider.generationCalls.grammar).toBe(0);
    expect(bed.provider.generationCalls.translate).toBe(0);
    expect(bed.store.state().kind).toBe('saved');
  });

  it('cancels between acceptance and the save, and writes nothing', async () => {
    bed.provider.storyQueue.push(ok(strictStory()));
    bed.runtime.beforeAnalyze = () => {
      bed.store.cancel();
    };

    await bed.store.generate(5, PREMISE);

    expect(bed.store.state().kind).toBe('cancelled');
    expect(bed.readings.readings).toHaveLength(0);
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
    expect(state.reading.translationSummary).toEqual({ total: 5, completed: 0, failed: 0 });
    expect(bed.store.canRetrySave()).toBe(false);
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
