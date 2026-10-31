import { Injectable, inject } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import { estimateTokens } from '../../domain/ai/context-budget';
import type { AssetJob } from '../../domain/enrichment/jobs';
import type { TranslationRecord } from '../../domain/enrichment/records';
import {
  freezeTranslationPlan,
  selectOpeningSentences,
  translationPassageWindow,
  validateGlossary,
  type ReadyTranslationPlan,
  type RepairTranslationPlan,
  type TranslationPlan,
} from '../../domain/enrichment/translation-plan';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { SentenceId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';
import { CLOCK, ENRICHMENT_REPOSITORY, HASHER, JOB_REPOSITORY } from '../shared/repository-tokens';
import type { LayerCounts } from './layer-progress';
import {
  TranslationJobPlanner,
  type TranslationJobContext,
} from './translation-job-planner.service';
import { TranslationService, type TranslationContext } from './translation.service';

/** What the running job lends this service: its stop signal, pacing, and progress. */
export interface TranslationRun {
  readonly signal: AbortSignal;
  readonly startedAt: number;
  readonly withPermit: <T>(position: number, run: () => Promise<T>) => Promise<T | null>;
  readonly publish: (counts: LayerCounts) => void;
}

/** The context every translation request of a plan carries. */
export function translationContextFor(
  plan: TranslationPlan,
  passage: readonly Sentence[],
): TranslationContext {
  return {
    ...(plan.title === '' ? {} : { titleJa: plan.title }),
    ...(plan.premise === '' ? {} : { premiseJa: plan.premise }),
    registerPreference: plan.register,
    glossaryCandidates: plan.candidates,
    passageWindow: passage,
    ...(plan.state === 'ready' ? { frozenGlossary: plan.glossary } : {}),
  };
}

/**
 * Settles the terms a reading's translation holds to: the opening passage that
 * freezes the glossary, and the repair of a glossary that came back unusable.
 *
 * Everything after this point is translated against what is frozen here.
 */
@Injectable({ providedIn: 'root' })
export class TranslationTerminologyService {
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly jobs = inject(JOB_REPOSITORY);
  private readonly translation = inject(TranslationService);
  private readonly planner = inject(TranslationJobPlanner);
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  async establishOpening(
    context: TranslationJobContext,
    job: AssetJob,
    counts: LayerCounts,
    run: TranslationRun,
  ): Promise<
    Result<{ context: TranslationJobContext; counts: LayerCounts } | null, AiError | StorageError>
  > {
    const openingPassage = translationPassageWindow(context.sentences, 0);
    const opening = selectOpeningSentences(
      context.sentences,
      estimateTokens(
        JSON.stringify({
          title: context.plan.title,
          premise: context.plan.premise,
          register: context.plan.register,
          candidates: context.plan.candidates,
          passage: openingPassage.map((sentence) => sentence.japaneseText),
        }),
      ),
    );
    const [openingFirst] = opening;
    if (openingFirst === undefined) {
      return err(
        aiError(
          'context-budget-exceeded',
          'translation',
          'The first sentence is too large to translate.',
          {
            detail: { issueCode: 'single-sentence-too-large' },
          },
        ),
      );
    }
    const passage = openingPassage;
    const outcome = await run.withPermit(openingFirst.positionInReading, () =>
      this.translation.run(
        opening,
        context.readingId,
        context.cacheKeys,
        context.modelId,
        PROMPT_VERSIONS.translation,
        context.taskConfig,
        run.signal,
        {
          ...translationContextFor(context.plan, passage),
          requestKind: 'opening',
          skipCacheLookup: true,
        },
      ),
    );
    if (outcome === null) return ok(null);
    const glossary =
      outcome.glossary === undefined
        ? err<string>('missing-glossary')
        : validateGlossary(context.plan.candidates, outcome.glossary);
    if (!glossary.ok) {
      if (outcome.records.length === 0) {
        return err(
          outcome.error ??
            aiError(
              'malformed-response',
              'translation',
              'The opening translation was not usable.',
              {
                detail: { issueCode: glossary.error },
              },
            ),
        );
      }
      const repair: RepairTranslationPlan = {
        ...context.plan,
        state: 'glossary-repair-required',
        provisionalOpeningSentenceIds: outcome.records.map((record) => record.sentenceId),
      };
      const committed = await this.enrichment.commitTranslationPlan(
        repair,
        outcome.records,
        context.cacheKeys,
        context.plan.inputFingerprint,
      );
      if (!committed.ok) return err(committed.error);
      this.logger.info('translation.first-persisted', {
        durationMs: this.clock.now() - run.startedAt,
        count: outcome.records.length,
      });
      for (const record of outcome.records) {
        const advanced = await this.jobs.recordCompletion(job.id, record.sentenceId);
        if (!advanced.ok) return err(advanced.error);
      }
      const nextCounts = { ...counts, completed: counts.completed + outcome.records.length };
      run.publish(nextCounts);
      return err(
        aiError(
          'malformed-response',
          'translation',
          'The opening is saved, but terminology needs repair.',
          {
            detail: { issueCode: glossary.error },
          },
        ),
      );
    }
    const ready = freezeTranslationPlan(
      this.hasher,
      context.plan as Exclude<TranslationPlan, ReadyTranslationPlan>,
      glossary.value,
    );
    const readyKeys = this.planner.keysForPlan(context.sentences, ready);
    const records = rekey(outcome.records, readyKeys);
    const committed = await this.enrichment.commitTranslationPlan(
      ready,
      records,
      readyKeys,
      context.plan.inputFingerprint,
    );
    if (!committed.ok) return err(committed.error);
    this.logger.info('translation.first-persisted', {
      durationMs: this.clock.now() - run.startedAt,
      count: records.length,
    });
    for (const record of records) {
      const advanced = await this.jobs.recordCompletion(job.id, record.sentenceId);
      if (!advanced.ok) return err(advanced.error);
    }
    const nextCounts = { ...counts, completed: counts.completed + records.length };
    run.publish(nextCounts);
    return ok({ context: { ...context, plan: ready, cacheKeys: readyKeys }, counts: nextCounts });
  }

  async repairGlossary(
    context: TranslationJobContext,
    job: AssetJob,
    counts: LayerCounts,
    run: TranslationRun,
  ): Promise<
    Result<{ context: TranslationJobContext; counts: LayerCounts }, AiError | StorageError>
  > {
    const plan = context.plan as RepairTranslationPlan;
    const rows = await this.enrichment.listTranslationsForSentences(
      plan.provisionalOpeningSentenceIds,
    );
    if (!rows.ok) return err(rows.error);
    const sentencesById = new Map(context.sentences.map((sentence) => [sentence.id, sentence]));
    const provisional = rows.value.filter((record) =>
      plan.provisionalOpeningSentenceIds.includes(record.sentenceId),
    );
    const openingTranslations = provisional.flatMap((record) => {
      const sentence = sentencesById.get(record.sentenceId);
      return sentence === undefined
        ? []
        : [{ textJa: sentence.japaneseText, textEn: record.textEn }];
    });
    const repaired = await run.withPermit(0, () =>
      this.translation.repairGlossary(
        {
          ...translationContextFor(plan, translationPassageWindow(context.sentences, 0)),
          requestKind: 'glossary-repair',
          openingTranslations,
        },
        plan.promptVersion,
        context.taskConfig,
        run.signal,
      ),
    );
    if (repaired === null)
      return err(aiError('cancelled', 'translation', 'The terminology repair was stopped.'));
    if (!repaired.ok) return repaired;
    const glossary = validateGlossary(plan.candidates, repaired.value);
    if (!glossary.ok) {
      return err(
        aiError('malformed-response', 'translation', 'The terminology repair was not usable.', {
          detail: { issueCode: glossary.error },
        }),
      );
    }
    const ready = freezeTranslationPlan(this.hasher, plan, glossary.value);
    const readyKeys = this.planner.keysForPlan(context.sentences, ready);
    const promotable = provisional.filter((record) => {
      const sentence = sentencesById.get(record.sentenceId);
      return (
        sentence !== undefined &&
        glossary.value.every(
          (entry) =>
            !sentence.japaneseText.includes(entry.surfaceJa) ||
            record.textEn
              .toLocaleLowerCase('en')
              .includes(entry.renderingEn.toLocaleLowerCase('en')),
        )
      );
    });
    const committed = await this.enrichment.commitTranslationPlan(
      ready,
      rekey(promotable, readyKeys),
      readyKeys,
      plan.inputFingerprint,
    );
    if (!committed.ok) return err(committed.error);
    const completed = new Set(job.completedSentenceIds);
    for (const record of promotable) {
      if (!completed.has(record.sentenceId)) {
        const advanced = await this.jobs.recordCompletion(job.id, record.sentenceId);
        if (!advanced.ok) return err(advanced.error);
      }
    }
    const nextCounts = {
      ...counts,
      completed: new Set([...completed, ...promotable.map((r) => r.sentenceId)]).size,
    };
    run.publish(nextCounts);
    return ok({ context: { ...context, plan: ready, cacheKeys: readyKeys }, counts: nextCounts });
  }
}

function rekey(
  records: readonly TranslationRecord[],
  keys: ReadonlyMap<SentenceId, string>,
): readonly TranslationRecord[] {
  return records.flatMap((record) => {
    const cacheKey = keys.get(record.sentenceId);
    return cacheKey === undefined ? [] : [{ ...record, cacheKey }];
  });
}
