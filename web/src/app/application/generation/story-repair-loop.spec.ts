import { describe, expect, it } from 'vitest';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { ExceptionDecision } from '../../domain/ai/exception-review';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { StoryCandidate, StoryGenerationRequest } from '../../domain/ai/story-request';
import type {
  ExceptionReviewRequest,
  StoryRepairRequest,
} from '../../domain/ai/text-generation-provider';
import type { AnalyzedSentence } from '../../domain/language/analyzed-text';
import { languageError, type LanguageError } from '../../domain/language/language-error';
import type { SentenceTokens } from '../../domain/language/language-runtime';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import { snapshotId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import {
  StoryRepairLoop,
  type RepairOutcome,
  type RepairProvider,
  type RepairRun,
  type RepairStage,
} from './story-repair-loop';

const SNAPSHOT = snapshotId('00000000-0000-4000-8000-000000000001');

const REQUEST: StoryGenerationRequest = {
  form: 'micro',
  requestedSentenceCount: 2,
  premise: 'ねこが一日をすごす話。',
  allowedVocabulary: ['ねこ', 'はし'],
  suggestedVocabulary: [],
  structuralBaseline: [],
  grammarGuidance: 'Write single short clauses.',
  registerPreference: 'either',
  snapshotId: SNAPSHOT,
  grammarProfileHash: 'profile-hash',
  promptVersion: 'story/1',
};

const TASK_CONFIG = { modelId: 'vendor/text-model', structuredOutput: 'native-schema' } as const;

/** The words the fake snapshot knows. Any other word is unknown. */
const KNOWN = new Set(['ねこ', 'はし']);

/** A story whose sentences are space-separated words, so a spec controls every token. */
function story(...sentences: string[]): StoryCandidate {
  return {
    titleJa: 'ねこ',
    sentences: sentences.map((textJa, index) => ({ index, textJa })),
  };
}

function tokensOf(text: string): readonly Token[] {
  let cursor = 0;
  return text.split(' ').map((surface, index) => {
    const startUtf16 = cursor;
    cursor += surface.length + 1;
    return {
      id: `${text}#${String(index)}`,
      startUtf16,
      endUtf16: startUtf16 + surface.length,
      surface,
      lemma: surface,
      dictionaryKeys: [],
      isPunctuation: false,
    };
  });
}

function approval(candidateId: string): ExceptionDecision {
  return {
    candidateId,
    decision: 'approved',
    explanationEn: 'The premise names this word, and the policy allows words I name.',
  };
}

function rejection(candidateId: string): ExceptionDecision {
  return { candidateId, decision: 'rejected', explanationEn: 'The policy does not cover it.' };
}

/** What a spec sees of the run, in the order it happened. */
interface Trace {
  readonly stages: RepairStage[];
  readonly announcements: string[];
  counts: { reviews: number; repairs: number };
}

class Harness {
  readonly controller = new AbortController();
  readonly trace: Trace = { stages: [], announcements: [], counts: { reviews: 0, repairs: 0 } };
  readonly reviewRequests: ExceptionReviewRequest[] = [];
  readonly repairRequests: StoryRepairRequest[] = [];
  readonly analyzed: string[][] = [];
  readonly reviewReplies: (() => Result<readonly ExceptionDecision[], AiError>)[] = [];
  readonly repairReplies: (() => Result<StoryCandidate, AiError>)[] = [];
  /** Runs inside the analysis, once the text has been tokenized. */
  duringAnalysis: (() => void) | null = null;
  /** Makes the tokenizer fail, or answer with too few sentences. */
  tokenizerFailure: LanguageError | null = null;
  tokenizerDropsASentence = false;
  /** Makes the classifier fail. */
  classifierFailure: LanguageError | null = null;

  private readonly provider: RepairProvider = {
    reviewExceptions: (request) => {
      this.reviewRequests.push(request);
      const reply = this.reviewReplies.shift();
      return Promise.resolve(reply === undefined ? ok([]) : reply());
    },
    repairStory: (request) => {
      this.repairRequests.push(request);
      const reply = this.repairReplies.shift();
      return Promise.resolve(
        reply === undefined ? err(aiError('unknown', 'story-repair', 'No reply queued.')) : reply(),
      );
    },
  };

  readonly loop = new StoryRepairLoop({
    runtime: {
      analyzeSentences: (texts) => {
        this.analyzed.push([...texts]);
        const sentences: AnalyzedSentence[] = texts.map((text) => ({
          startUtf16: 0,
          endUtf16: text.length,
          text,
          tokens: tokensOf(text),
        }));
        this.duringAnalysis?.();
        if (this.tokenizerFailure !== null) {
          return Promise.resolve(err(this.tokenizerFailure));
        }
        return Promise.resolve(ok(this.tokenizerDropsASentence ? sentences.slice(1) : sentences));
      },
    },
    classification: {
      classifyGenerated: (_snapshot, sentences: readonly SentenceTokens[]) =>
        Promise.resolve(
          this.classifierFailure !== null
            ? err(this.classifierFailure)
            : ok({
                snapshotId: SNAPSHOT,
                validatorVersion: 'test',
                sentences: sentences.map((sentence) => ({
                  sentenceId: sentence.sentenceId,
                  statuses: sentence.tokens.map((token): TokenStatusAssignment => ({
                    tokenId: token.id,
                    validation: KNOWN.has(token.surface)
                      ? { category: 'anki-exact', vocabularyItemIds: [] }
                      : { category: 'unknown', reason: 'not-in-vocabulary' },
                  })),
                })),
              }),
        ),
    },
    provider: this.provider,
    progress: {
      stage: (stage, announcement) => {
        this.trace.stages.push(stage);
        if (announcement !== undefined) {
          this.trace.announcements.push(announcement);
        }
      },
      counted: (counts) => {
        this.trace.counts = counts;
      },
    },
  });

  run(first: StoryCandidate, overrides: Partial<RepairRun> = {}): Promise<RepairOutcome> {
    return this.loop.run({
      firstCandidate: first,
      request: REQUEST,
      snapshotId: SNAPSHOT,
      policyText: '',
      taskConfig: TASK_CONFIG,
      repairBudget: 2,
      signal: this.controller.signal,
      ...overrides,
    });
  }

  get stageKinds(): string[] {
    return this.trace.stages.map((stage) => stage.kind);
  }
}

/** The final status category of every token whose surface is `surface`. */
function categoriesOf(outcome: RepairOutcome, surface: string): string[] {
  if (outcome.kind !== 'accepted' && outcome.kind !== 'exhausted') {
    return expect.unreachable('expected a settled story');
  }
  return outcome.units.flatMap((unit) =>
    unit.statuses
      .filter(
        (status) => unit.tokens.find((token) => token.id === status.tokenId)?.surface === surface,
      )
      .map((status) =>
        status.validation.category === 'unknown'
          ? `unknown:${status.validation.reason}`
          : status.validation.category,
      ),
  );
}

describe('StoryRepairLoop', () => {
  it('accepts a story whose every word is known without asking the provider anything', async () => {
    const harness = new Harness();

    const outcome = await harness.run(story('ねこ はし', 'はし ねこ'));

    expect(outcome).toMatchObject({ kind: 'accepted', exceptionCount: 0, repairAttempts: 0 });
    expect(harness.stageKinds).toEqual(['parsing', 'validating']);
    expect(harness.trace.announcements).toEqual(['Checking every word against your vocabulary…']);
    expect(harness.reviewRequests).toHaveLength(0);
    expect(harness.repairRequests).toHaveLength(0);
    expect(harness.analyzed).toEqual([['ねこ', 'ねこ はし', 'はし ねこ']]);
  });

  it('analyses the sentences in index order, whatever order the model sent them in', async () => {
    const harness = new Harness();
    const shuffled: StoryCandidate = {
      titleJa: 'ねこ',
      sentences: [
        { index: 1, textJa: 'はし' },
        { index: 0, textJa: 'ねこ' },
      ],
    };

    await harness.run(shuffled);

    expect(harness.analyzed[0]).toEqual(['ねこ', 'ねこ', 'はし']);
  });

  it('repairs an unknown word, reparses the reply in full, and accepts it', async () => {
    const harness = new Harness();
    harness.repairReplies.push(() => ok(story('ねこ はし', 'はし ねこ')));

    const outcome = await harness.run(story('ねこ ほん', 'はし ねこ'));

    expect(outcome).toMatchObject({ kind: 'accepted', repairAttempts: 1 });
    expect(harness.stageKinds).toEqual([
      'parsing',
      'validating',
      'repairing',
      'parsing',
      'validating',
    ]);
    expect(harness.trace.stages[2]).toEqual({
      kind: 'repairing',
      attempt: 1,
      totalAttempts: 2,
      unknownCount: 1,
      structureIssueCount: 0,
    });
    expect(harness.trace.announcements[1]).toBe('Replacing 1 unfamiliar word (attempt 1 of 2)…');
    expect(harness.trace.counts).toEqual({ reviews: 0, repairs: 1 });
    // The reply is analysed from scratch, not patched into the earlier analysis.
    expect(harness.analyzed).toHaveLength(2);
    expect(harness.analyzed[1]).toEqual(['ねこ', 'ねこ はし', 'はし ねこ']);
  });

  it('sends the repair exactly what it needs and nothing from a later pass', async () => {
    const harness = new Harness();
    harness.repairReplies.push(() => ok(story('ねこ はし')));
    const first = story('ねこ ほん ほん', 'ほん はし');

    await harness.run(first);

    expect(harness.repairRequests).toEqual([
      {
        original: REQUEST,
        candidate: first,
        // One span per sentence per word, even when a sentence repeats it.
        unknownSpans: [
          { sentenceIndex: 0, surface: 'ほん' },
          { sentenceIndex: 1, surface: 'ほん' },
        ],
        structureIssues: [],
        attempt: 1,
        previouslyAttempted: [],
        promptVersion: PROMPT_VERSIONS.repair,
      },
    ]);
  });

  it('names a surface an earlier repair already failed to remove', async () => {
    const harness = new Harness();
    harness.repairReplies.push(
      () => ok(story('ねこ ほん', 'はし')),
      () => ok(story('ねこ はし')),
    );

    const outcome = await harness.run(story('ねこ ほん', 'はし'));

    expect(outcome).toMatchObject({ kind: 'accepted', repairAttempts: 2 });
    expect(harness.repairRequests.map((request) => request.previouslyAttempted)).toEqual([
      [],
      ['ほん'],
    ]);
    expect(harness.repairRequests.map((request) => request.attempt)).toEqual([1, 2]);
  });

  it('keeps what a repair fixed and marks only the words it could not replace', async () => {
    const harness = new Harness();
    harness.repairReplies.push(() => ok(story('ねこ くるま', 'はし')));

    const outcome = await harness.run(story('ほん くるま', 'はし'), { repairBudget: 1 });

    expect(outcome).toMatchObject({ kind: 'exhausted', repairAttempts: 1 });
    // The second pass asked about the one word still unknown, not both.
    expect(harness.repairRequests).toHaveLength(1);
    expect(categoriesOf(outcome, 'くるま')).toEqual(['unknown:unresolved-after-repair']);
    expect(categoriesOf(outcome, 'ほん')).toEqual([]);
    expect(categoriesOf(outcome, 'ねこ')).toEqual(['anki-exact', 'anki-exact']);
  });

  it('narrows the next request to the words that are still unknown', async () => {
    const harness = new Harness();
    harness.repairReplies.push(
      () => ok(story('ねこ くるま', 'はし')),
      () => ok(story('ねこ はし')),
    );

    const outcome = await harness.run(story('ほん くるま', 'はし'));

    expect(outcome).toMatchObject({ kind: 'accepted', repairAttempts: 2 });
    expect(harness.repairRequests[0]?.unknownSpans.map((span) => span.surface)).toEqual([
      'ほん',
      'くるま',
    ]);
    expect(harness.repairRequests[1]?.unknownSpans.map((span) => span.surface)).toEqual(['くるま']);
  });

  it('stops at the budget and marks every word it could not replace', async () => {
    const harness = new Harness();
    harness.repairReplies.push(
      () => ok(story('ねこ ほん', 'はし')),
      () => ok(story('ねこ ほん', 'はし')),
    );

    const outcome = await harness.run(story('ねこ ほん', 'はし'));

    expect(outcome).toMatchObject({ kind: 'exhausted', repairAttempts: 2 });
    expect(harness.repairRequests).toHaveLength(2);
    expect(harness.trace.counts).toEqual({ reviews: 0, repairs: 2 });
    expect(categoriesOf(outcome, 'ほん')).toEqual(['unknown:unresolved-after-repair']);
    expect(harness.trace.announcements.at(-2)).toBe(
      'Replacing 1 unfamiliar word (attempt 2 of 2)…',
    );
  });

  it('saves the first draft without a repair when the budget is zero', async () => {
    const harness = new Harness();

    const outcome = await harness.run(story('ねこ ほん', 'はし'), { repairBudget: 0 });

    expect(outcome).toMatchObject({ kind: 'exhausted', repairAttempts: 0 });
    expect(harness.repairRequests).toHaveLength(0);
    expect(harness.stageKinds).toEqual(['parsing', 'validating']);
    expect(categoriesOf(outcome, 'ほん')).toEqual(['unknown:unresolved-after-repair']);
  });

  it('repairs a structural fault with no unknown word and says so', async () => {
    const harness = new Harness();
    harness.repairReplies.push(() => ok(story('ねこ', 'はし')));
    const duplicated: StoryCandidate = {
      titleJa: 'ねこ',
      sentences: [
        { index: 0, textJa: 'ねこ' },
        { index: 0, textJa: 'はし' },
      ],
    };

    const outcome = await harness.run(duplicated);

    expect(outcome).toMatchObject({ kind: 'accepted', repairAttempts: 1 });
    expect(harness.trace.stages[2]).toMatchObject({
      kind: 'repairing',
      unknownCount: 0,
      structureIssueCount: 2,
    });
    expect(harness.trace.announcements[1]).toBe('Fixing the story structure (attempt 1 of 2)…');
    expect(harness.repairRequests[0]?.unknownSpans).toEqual([]);
    expect(harness.repairRequests[0]?.structureIssues.map((issue) => issue.code)).toEqual([
      'duplicate-index',
      'non-contiguous-index',
    ]);
  });

  it('mentions the structure alongside the words when both are wrong', async () => {
    const harness = new Harness();
    harness.repairReplies.push(() => ok(story('ねこ')));
    const broken: StoryCandidate = {
      titleJa: 'ねこ',
      sentences: [
        { index: 0, textJa: 'ほん' },
        { index: 0, textJa: 'ねこ' },
      ],
    };

    await harness.run(broken);

    expect(harness.trace.announcements[1]).toBe(
      'Replacing 1 unfamiliar word and fixing the story structure (attempt 1 of 2)…',
    );
  });

  describe('exception review', () => {
    it('asks only when there is a policy and something unknown', async () => {
      const harness = new Harness();

      await harness.run(story('ねこ はし'), { policyText: 'Allow place names.' });
      expect(harness.reviewRequests).toHaveLength(0);

      await harness.run(story('ほん'), { policyText: '', repairBudget: 0 });
      expect(harness.reviewRequests).toHaveLength(0);
    });

    it('accepts an approved word as an exception and counts it', async () => {
      const harness = new Harness();
      harness.reviewReplies.push(() => ok([approval('ほん|ほん')]));

      const outcome = await harness.run(story('ねこ ほん', 'はし'), {
        policyText: 'Allow place names.',
      });

      expect(outcome).toMatchObject({ kind: 'accepted', exceptionCount: 1, repairAttempts: 0 });
      expect(categoriesOf(outcome, 'ほん')).toEqual(['policy-exception']);
      expect(harness.stageKinds).toEqual(['parsing', 'validating', 'exception-review']);
      expect(harness.trace.stages[2]).toEqual({ kind: 'exception-review', candidateCount: 1 });
      expect(harness.trace.announcements[1]).toBe(
        'Asking your exception policy about 1 unfamiliar words…',
      );
      expect(harness.trace.counts).toEqual({ reviews: 1, repairs: 0 });
      expect(harness.reviewRequests[0]).toMatchObject({
        policyText: 'Allow place names.',
        promptVersion: PROMPT_VERSIONS['exception-review'],
      });
    });

    it('does not ask again about a word the policy already refused', async () => {
      const harness = new Harness();
      harness.reviewReplies.push(() => ok([rejection('ほん|ほん')]));
      harness.repairReplies.push(() => ok(story('ねこ ほん')));

      const outcome = await harness.run(story('ねこ ほん'), {
        policyText: 'Allow place names.',
        repairBudget: 1,
      });

      expect(outcome).toMatchObject({ kind: 'exhausted', repairAttempts: 1 });
      expect(harness.reviewRequests).toHaveLength(1);
      // The refusal still counts against the story on the pass that skipped the review.
      expect(categoriesOf(outcome, 'ほん')).toEqual(['unknown:unresolved-after-repair']);
      expect(harness.trace.counts).toEqual({ reviews: 1, repairs: 1 });
    });

    it('treats a failed review as no approval and goes on to repair', async () => {
      const harness = new Harness();
      harness.reviewReplies.push(() =>
        err(aiError('provider-unavailable', 'exception-review', 'x')),
      );
      harness.repairReplies.push(() => ok(story('ねこ')));

      const outcome = await harness.run(story('ねこ ほん'), { policyText: 'Allow place names.' });

      expect(outcome).toMatchObject({ kind: 'accepted', exceptionCount: 0, repairAttempts: 1 });
      expect(harness.repairRequests[0]?.unknownSpans).toEqual([
        { sentenceIndex: 0, surface: 'ほん' },
      ]);
    });
  });

  describe('failure and cancellation', () => {
    it('reports a repair failure without trying again', async () => {
      const harness = new Harness();
      const failure = aiError('malformed-response', 'story-repair', 'unreadable');
      harness.repairReplies.push(() => err(failure));

      const outcome = await harness.run(story('ねこ ほん'));

      expect(outcome).toEqual({ kind: 'failed', error: failure });
      expect(harness.repairRequests).toHaveLength(1);
      expect(harness.stageKinds.at(-1)).toBe('repairing');
    });

    it('reports a provider cancellation as a cancellation', async () => {
      const harness = new Harness();
      harness.repairReplies.push(() => err(aiError('cancelled', 'story-repair', 'stopped')));

      const outcome = await harness.run(story('ねこ ほん'));

      expect(outcome).toEqual({ kind: 'cancelled' });
    });

    it('cancels while a repair is in flight, and does not parse what comes back', async () => {
      const harness = new Harness();
      harness.repairReplies.push(() => {
        harness.controller.abort();
        return err(aiError('cancelled', 'story-repair', 'stopped'));
      });

      const outcome = await harness.run(story('ねこ ほん'));

      expect(outcome).toEqual({ kind: 'cancelled' });
      expect(harness.stageKinds).toEqual(['parsing', 'validating', 'repairing']);
      expect(harness.analyzed).toHaveLength(1);
    });

    it('prefers the abort to an ordinary failure that arrives with it', async () => {
      const harness = new Harness();
      harness.repairReplies.push(() => {
        harness.controller.abort();
        return err(aiError('offline', 'story-repair', 'network dropped by the abort'));
      });

      const outcome = await harness.run(story('ねこ ほん'));

      expect(outcome).toEqual({ kind: 'cancelled' });
    });

    it('reports a review cancelled by the provider as a cancellation, though the signal is live', async () => {
      const harness = new Harness();
      harness.reviewReplies.push(() => err(aiError('cancelled', 'exception-review', 'stopped')));
      harness.repairReplies.push(() => ok(story('ねこ')));

      const outcome = await harness.run(story('ねこ ほん'), { policyText: 'Allow place names.' });

      expect(harness.controller.signal.aborted).toBe(false);
      expect(outcome).toEqual({ kind: 'cancelled' });
      expect(harness.repairRequests).toHaveLength(0);
    });

    it('reports a tokenizer failure, and asks the provider nothing', async () => {
      const harness = new Harness();
      const failure = languageError('analysis-failed', 'The tokenizer gave up.');
      harness.tokenizerFailure = failure;

      const outcome = await harness.run(story('ねこ ほん'), { policyText: 'Allow place names.' });

      expect(outcome).toEqual({ kind: 'failed', error: failure });
      expect(harness.stageKinds).toEqual(['parsing', 'validating']);
      expect(harness.reviewRequests).toHaveLength(0);
      expect(harness.repairRequests).toHaveLength(0);
    });

    it('reports a classifier failure', async () => {
      const harness = new Harness();
      const failure = languageError('snapshot-not-compiled', 'The snapshot is not compiled.');
      harness.classifierFailure = failure;

      const outcome = await harness.run(story('ねこ ほん'));

      expect(outcome).toEqual({ kind: 'failed', error: failure });
      expect(harness.repairRequests).toHaveLength(0);
    });

    it('refuses an analysis with the wrong number of sentences', async () => {
      const harness = new Harness();
      harness.tokenizerDropsASentence = true;

      const outcome = await harness.run(story('ねこ はし'));

      expect(outcome).toMatchObject({
        kind: 'failed',
        error: {
          domain: 'ai',
          code: 'unknown',
          task: 'story-generation',
          detail: { issueCode: 'analysis-length-mismatch' },
        },
      });
    });

    it('reports a cancelled analysis as a cancellation only when the signal is aborted', async () => {
      const cancelled = languageError('cancelled', 'The worker call was cancelled.');

      const live = new Harness();
      live.tokenizerFailure = cancelled;
      // A language error carries no `ai` domain, so on its own it is a failure.
      expect(await live.run(story('ねこ'))).toEqual({ kind: 'failed', error: cancelled });

      const aborted = new Harness();
      aborted.tokenizerFailure = cancelled;
      aborted.controller.abort();
      expect(await aborted.run(story('ねこ'))).toEqual({ kind: 'cancelled' });
    });

    it('stops at an abort that lands during the analysis, before anything else is asked', async () => {
      const harness = new Harness();
      harness.duringAnalysis = () => {
        harness.controller.abort();
      };

      const outcome = await harness.run(story('ねこ ほん'), { policyText: 'Allow place names.' });

      expect(outcome).toEqual({ kind: 'cancelled' });
      // The unknown word would have gone to review and then repair.
      expect(harness.stageKinds).toEqual(['parsing', 'validating']);
      expect(harness.reviewRequests).toHaveLength(0);
      expect(harness.repairRequests).toHaveLength(0);
      expect(harness.trace.counts).toEqual({ reviews: 0, repairs: 0 });
    });

    it('stops at an abort that lands during a review that then fails', async () => {
      const harness = new Harness();
      harness.reviewReplies.push(() => {
        harness.controller.abort();
        return err(aiError('offline', 'exception-review', 'dropped by the abort'));
      });
      harness.repairReplies.push(() => ok(story('ねこ')));

      const outcome = await harness.run(story('ねこ ほん'), { policyText: 'Allow place names.' });

      expect(outcome).toEqual({ kind: 'cancelled' });
      expect(harness.repairRequests).toHaveLength(0);
      expect(harness.trace.counts).toEqual({ reviews: 1, repairs: 0 });
    });

    it('never accepts a repaired story that came back after the abort', async () => {
      const harness = new Harness();
      harness.repairReplies.push(() => {
        harness.controller.abort();
        return ok(story('ねこ はし'));
      });

      const outcome = await harness.run(story('ねこ ほん'));

      expect(outcome).toEqual({ kind: 'cancelled' });
      expect(harness.repairRequests).toHaveLength(1);
      expect(harness.trace.counts).toEqual({ reviews: 0, repairs: 1 });
    });

    it('can run again after a cancelled run, with nothing remembered', async () => {
      const harness = new Harness();
      harness.repairReplies.push(() => err(aiError('cancelled', 'story-repair', 'stopped')));
      await harness.run(story('ほん'));
      harness.repairReplies.push(() => ok(story('ねこ')));

      const outcome = await harness.run(story('ほん'));

      expect(outcome).toMatchObject({ kind: 'accepted', repairAttempts: 1 });
      // The surface that was asked about in the first run is not "previously attempted".
      expect(harness.repairRequests[1]?.previouslyAttempted).toEqual([]);
    });
  });
});
