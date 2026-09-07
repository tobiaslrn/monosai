import { Injectable, computed, inject, signal } from '@angular/core';
import { aiError, isAutomaticallyRetryable, type AiError } from '../../domain/ai/ai-error';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import { estimateTokens } from '../../domain/ai/context-budget';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { translationConfigFingerprint } from '../../domain/enrichment/cache-keys';
import { remainingSentenceIds, type AssetJob, type JobState } from '../../domain/enrichment/jobs';
import type { TranslationRecord } from '../../domain/enrichment/records';
import {
  createPendingTranslationPlan,
  freezeTranslationPlan,
  passageContextFingerprint,
  selectOpeningSentences,
  translationPassageWindow,
  validateGlossary,
  type ReadyTranslationPlan,
  type RepairTranslationPlan,
  type TranslationPlan,
  TRANSLATION_INPUT_BUDGET_TOKENS,
} from '../../domain/enrichment/translation-plan';
import type { Reading } from '../../domain/reading/reading';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { jobId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { TextModelStore } from '../settings/text-model.store';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';
import {
  CLOCK,
  ENRICHMENT_REPOSITORY,
  HASHER,
  ID_GENERATOR,
  JOB_REPOSITORY,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { NOTHING_TO_DO, QUEUED, type EnqueueOutcome, type LayerError } from './layer-progress';
import { PreparationPacer, backOffOnRateLimit } from './preparation-pacer';
import { TranslationService, type TranslationContext } from './translation.service';

export type TranslationJobError =
  | { readonly source: 'provider'; readonly error: AiError }
  | { readonly source: 'storage'; readonly error: StorageError };

export interface TranslationJobCounts {
  readonly total: number;
  readonly requested: number;
  readonly completed: number;
  readonly failed: number;
}

export type TranslationJobProgress =
  | { readonly kind: 'idle' }
  | { readonly kind: 'preparing'; readonly readingId: ReadingId }
  | {
      readonly kind: 'running';
      readonly readingId: ReadingId;
      readonly counts: TranslationJobCounts;
    }
  | {
      readonly kind: 'complete';
      readonly readingId: ReadingId;
      readonly counts: TranslationJobCounts;
    }
  | {
      readonly kind: 'cancelled';
      readonly readingId: ReadingId;
      readonly counts: TranslationJobCounts;
    }
  | {
      readonly kind: 'paused';
      readonly readingId: ReadingId;
      readonly counts: TranslationJobCounts;
    }
  | { readonly kind: 'deleted'; readonly readingId: ReadingId }
  | {
      readonly kind: 'failed';
      readonly readingId: ReadingId;
      readonly counts: TranslationJobCounts;
      readonly error: TranslationJobError;
    };

const IDLE: TranslationJobProgress = { kind: 'idle' };
export const MAX_ACTIVE_TRANSLATION_REQUESTS = 3;

type JobScope = 'current-configuration' | 'never-prepared';
type UnavailableOutcome = Extract<EnqueueOutcome, { kind: 'unavailable' }>;
type PlanOutcome =
  | { readonly kind: 'planned'; readonly context: JobContext; readonly job: AssetJob }
  | { readonly kind: 'nothing-to-do'; readonly context: JobContext }
  | { readonly kind: 'unavailable'; readonly outcome: UnavailableOutcome };

interface JobContext {
  readonly readingId: ReadingId;
  readonly modelId: string;
  readonly taskConfig: TextTaskConfig;
  readonly reading: Reading;
  readonly sentences: readonly Sentence[];
  readonly plan: TranslationPlan;
  readonly cacheKeys: ReadonlyMap<SentenceId, string>;
  readonly fingerprint: string;
  readonly total: number;
}

function unavailable(error: LayerError): PlanOutcome {
  return { kind: 'unavailable', outcome: { kind: 'unavailable', error } };
}

@Injectable({ providedIn: 'root' })
export class TranslationJobStore {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly jobs = inject(JOB_REPOSITORY);
  private readonly translation = inject(TranslationService);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly pacer = inject(PreparationPacer);
  private readonly textModel = inject(TextModelStore);
  private readonly grammarProfile = inject(GrammarProfileStore);
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;
  private readonly progressSignal = signal<TranslationJobProgress>(IDLE);
  private controller: AbortController | null = null;
  private yieldRequested = false;
  private activeRun: Promise<void> | null = null;
  private runStartedAt = 0;
  private requestCount = 0;

  readonly progress = this.progressSignal.asReadonly();
  readonly isRunning = computed(() =>
    ['preparing', 'running'].includes(this.progressSignal().kind),
  );
  readonly idleProgress: TranslationJobProgress = IDLE;

  progressFor(readingId: ReadingId): TranslationJobProgress {
    const progress = this.progressSignal();
    return progress.kind !== 'idle' && progress.readingId === readingId ? progress : IDLE;
  }

  isRunningFor(readingId: ReadingId): boolean {
    return ['preparing', 'running'].includes(this.progressFor(readingId).kind);
  }

  async enqueue(
    readingId: ReadingId,
    intent: 'automatic' | 'explicit' = 'automatic',
  ): Promise<EnqueueOutcome> {
    const prepared = await this.plan(
      readingId,
      intent === 'explicit' ? 'current-configuration' : 'never-prepared',
      'queued',
    );
    if (prepared.kind !== 'planned') {
      return prepared.kind === 'nothing-to-do' ? NOTHING_TO_DO : prepared.outcome;
    }
    return remainingSentenceIds(prepared.job).length === 0 ? NOTHING_TO_DO : QUEUED;
  }

  yieldAfterBatch(): void {
    if (this.isRunning()) this.yieldRequested = true;
  }

  async start(readingId: ReadingId): Promise<void> {
    if (this.activeRun !== null) {
      await this.activeRun;
      return;
    }
    const run = this.run(readingId);
    this.activeRun = run;
    try {
      await run;
    } finally {
      if (this.activeRun === run) this.activeRun = null;
    }
  }

  private async run(readingId: ReadingId): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    this.yieldRequested = false;
    this.runStartedAt = this.clock.now();
    this.requestCount = 0;
    this.progressSignal.set({ kind: 'preparing', readingId });
    this.logger.info('job.started', { kind: 'translation' });
    const prepared = await this.plan(readingId, 'current-configuration', 'running');
    if (prepared.kind === 'unavailable') {
      this.report(readingId, prepared.outcome.error);
      return;
    }
    if (prepared.kind === 'nothing-to-do') {
      this.controller = null;
      this.progressSignal.set({
        kind: 'complete',
        readingId,
        counts: { total: prepared.context.total, requested: 0, completed: 0, failed: 0 },
      });
      return;
    }
    await this.process(prepared.context, prepared.job, controller.signal);
  }

  async resume(readingId: ReadingId): Promise<void> {
    if (this.isRunning()) return;
    const existing = await this.jobs.findActive(readingId, 'translate-reading');
    if (!existing.ok) {
      this.failStorage(readingId, existing.error, emptyCounts());
      return;
    }
    if (existing.value === null) {
      if (this.progressFor(readingId).kind !== 'idle') this.progressSignal.set(IDLE);
      return;
    }
    await this.start(readingId);
  }

  retry(readingId: ReadingId): Promise<void> {
    return this.start(readingId);
  }

  cancel(readingId: ReadingId): void {
    if (this.owns(readingId)) this.controller?.abort();
  }

  async cancelAndWait(readingId: ReadingId): Promise<void> {
    this.cancel(readingId);
    await this.activeRun;
  }

  async readingDeleted(readingId: ReadingId): Promise<void> {
    if (!this.owns(readingId)) return;
    await this.cancelAndWait(readingId);
    this.progressSignal.set({ kind: 'deleted', readingId });
  }

  acknowledge(readingId: ReadingId): void {
    if (this.owns(readingId) && !this.isRunningFor(readingId)) this.progressSignal.set(IDLE);
  }

  private owns(readingId: ReadingId): boolean {
    const progress = this.progressSignal();
    return progress.kind !== 'idle' && progress.readingId === readingId;
  }

  private async plan(
    readingId: ReadingId,
    scope: JobScope,
    initialState: JobState,
  ): Promise<PlanOutcome> {
    const configured = this.textModel.configForTask('translation');
    if (configured === null) {
      return unavailable({
        source: 'provider',
        error: aiError(
          'capability-unsupported',
          'translation',
          'No tested text model is available for translation.',
          {
            detail: { capability: 'structured-output' },
          },
        ),
      });
    }
    const [readingResult, refsResult] = await Promise.all([
      this.readings.getReading(readingId),
      this.readings.listSentenceRefs(readingId),
    ]);
    if (!readingResult.ok) return unavailable({ source: 'storage', error: readingResult.error });
    if (!refsResult.ok) return unavailable({ source: 'storage', error: refsResult.error });
    if (readingResult.value === null) {
      return unavailable({
        source: 'storage',
        error: { domain: 'storage', code: 'not-found', message: 'The reading no longer exists.' },
      });
    }
    const loaded = await this.readings.loadSentences(refsResult.value.map((ref) => ref.id));
    if (!loaded.ok) return unavailable({ source: 'storage', error: loaded.error });
    const sentences = ordered(loaded.value);
    if (scope === 'never-prepared') {
      const ever = await this.enrichment.listSentenceIdsWithStoredTranslation(
        sentences.map((sentence) => sentence.id),
      );
      if (!ever.ok) return unavailable({ source: 'storage', error: ever.error });
      if (ever.value.length > 0) {
        return this.nothingContext(readingResult.value, sentences, configured);
      }
    }
    if (!this.grammarProfile.loaded()) await this.grammarProfile.load();
    const analyses = await this.readings.loadTokenAnalyses(
      sentences.map((sentence) => sentence.id),
    );
    if (!analyses.ok) return unavailable({ source: 'storage', error: analyses.error });
    const pending = createPendingTranslationPlan(
      this.hasher,
      {
        readingId,
        modelId: configured.modelId,
        promptVersion: PROMPT_VERSIONS.translation,
        title: readingResult.value.title,
        premise: readingResult.value.kind === 'generated' ? readingResult.value.premise : '',
        register: this.grammarProfile.selection().registerPreference,
        sentences,
        analyses: analyses.value,
      },
      this.clock.now(),
    );
    const found = await this.enrichment.getTranslationPlan(readingId);
    if (!found.ok) return unavailable({ source: 'storage', error: found.error });
    let plan: TranslationPlan;
    if (found.value?.inputFingerprint === pending.inputFingerprint) {
      plan = found.value;
    } else {
      const saved = await this.enrichment.storeTranslationPlan(pending);
      if (!saved.ok) return unavailable({ source: 'storage', error: saved.error });
      plan = saved.value;
    }
    const cacheKeys = this.keysForPlan(sentences, plan);
    const fingerprint = translationConfigFingerprint(
      this.hasher,
      configured.modelId,
      PROMPT_VERSIONS.translation,
      plan.inputFingerprint,
    );
    const context: JobContext = {
      readingId,
      modelId: configured.modelId,
      taskConfig: configured,
      reading: readingResult.value,
      sentences,
      plan,
      cacheKeys,
      fingerprint,
      total: sentences.length,
    };
    const active = await this.jobs.findActive(readingId, 'translate-reading');
    if (!active.ok) return unavailable({ source: 'storage', error: active.error });
    if (active.value !== null && active.value.configFingerprint === fingerprint) {
      const reconciled = await this.reconcile(context, active.value);
      return reconciled.ok
        ? { kind: 'planned', context, job: reconciled.value }
        : unavailable({ source: 'storage', error: reconciled.error });
    }
    if (active.value !== null) {
      const closed = await this.jobs.setState(active.value.id, 'cancelled');
      if (!closed.ok) return unavailable({ source: 'storage', error: closed.error });
    }
    const missing =
      plan.state === 'ready'
        ? await this.translation.missingSentenceIds(readingId, cacheKeys)
        : ok(sentences.map((sentence) => sentence.id));
    if (!missing.ok) return unavailable({ source: 'storage', error: missing.error });
    if (missing.value.length === 0) return { kind: 'nothing-to-do', context };
    const created = await this.createJob(context, missing.value, initialState);
    return created.ok
      ? { kind: 'planned', context, job: created.value }
      : unavailable({ source: 'storage', error: created.error });
  }

  private nothingContext(
    reading: Reading,
    sentences: readonly Sentence[],
    config: TextTaskConfig,
  ): PlanOutcome {
    const pending = createPendingTranslationPlan(
      this.hasher,
      {
        readingId: reading.id,
        modelId: config.modelId,
        promptVersion: PROMPT_VERSIONS.translation,
        title: reading.title,
        premise: reading.kind === 'generated' ? reading.premise : '',
        register: 'either',
        sentences,
        analyses: [],
      },
      this.clock.now(),
    );
    return {
      kind: 'nothing-to-do',
      context: {
        readingId: reading.id,
        modelId: config.modelId,
        taskConfig: config,
        reading,
        sentences,
        plan: pending,
        cacheKeys: new Map(),
        fingerprint: pending.inputFingerprint,
        total: sentences.length,
      },
    };
  }

  private keysForPlan(
    sentences: readonly Sentence[],
    plan: TranslationPlan,
  ): ReadonlyMap<SentenceId, string> {
    const passageFingerprintBySentence = new Map<SentenceId, string>();
    for (const sentence of sentences) {
      passageFingerprintBySentence.set(
        sentence.id,
        passageContextFingerprint(
          this.hasher,
          translationPassageWindow(sentences, sentence.positionInReading),
        ),
      );
    }
    return this.keys.translationKeys(sentences, plan.modelId, plan.promptVersion, {
      planFingerprint:
        plan.state === 'ready' ? plan.planFingerprint : `provisional:${plan.inputFingerprint}`,
      passageFingerprintBySentence,
    });
  }

  private async reconcile(
    context: JobContext,
    job: AssetJob,
  ): Promise<Result<AssetJob, StorageError>> {
    if (context.plan.state !== 'ready') return ok(job);
    const missing = await this.translation.missingSentenceIds(context.readingId, context.cacheKeys);
    if (!missing.ok) return missing;
    const outstanding = new Set(missing.value);
    return this.jobs.reconcile(
      job.id,
      job.orderedSentenceIds.filter((id) => !outstanding.has(id)),
    );
  }

  private createJob(
    context: JobContext,
    orderedSentenceIds: readonly SentenceId[],
    state: JobState,
  ): Promise<Result<AssetJob, StorageError>> {
    const now = this.clock.now();
    return this.jobs.create({
      id: jobId(this.ids.nextId()),
      kind: 'translate-reading',
      readingId: context.readingId,
      state,
      orderedSentenceIds,
      completedSentenceIds: [],
      failedItems: [],
      configFingerprint: context.fingerprint,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async process(context: JobContext, job: AssetJob, signal: AbortSignal): Promise<void> {
    let counts: TranslationJobCounts = {
      total: context.total,
      requested: job.orderedSentenceIds.length,
      completed: job.completedSentenceIds.length,
      failed: job.failedItems.length,
    };
    if (job.state !== 'running') {
      const started = await this.jobs.setState(job.id, 'running');
      if (!started.ok) {
        this.failStorage(context.readingId, started.error, counts);
        return;
      }
    }
    this.progressSignal.set({ kind: 'running', readingId: context.readingId, counts });
    let readyContext: JobContext | null = context.plan.state === 'ready' ? context : null;
    if (context.plan.state === 'opening-pending') {
      const established = await this.establishOpening(context, job, counts, signal);
      if (!established.ok) {
        if (
          signal.aborted ||
          (established.error.domain === 'ai' && established.error.code === 'cancelled')
        ) {
          await this.markCancelled(job, counts);
          return;
        }
        await this.failRun(job, context.readingId, established.error, counts);
        return;
      }
      if (established.value === null) {
        await this.markCancelled(job, counts);
        return;
      }
      readyContext = established.value.context;
      counts = established.value.counts;
    } else if (context.plan.state === 'glossary-repair-required') {
      const repaired = await this.repairGlossary(context, job, counts, signal);
      if (!repaired.ok) {
        if (
          signal.aborted ||
          (repaired.error.domain === 'ai' && repaired.error.code === 'cancelled')
        ) {
          await this.markCancelled(job, counts);
          return;
        }
        await this.failRun(job, context.readingId, repaired.error, counts);
        return;
      }
      readyContext = repaired.value.context;
      counts = repaired.value.counts;
    }
    if (readyContext === null) return;
    const tail = await this.runTail(readyContext, job, counts, signal);
    counts = tail.counts;
    if (tail.storage !== null) {
      this.failStorage(context.readingId, tail.storage, counts);
      return;
    }
    if (signal.aborted) {
      await this.markCancelled(job, counts);
      return;
    }
    if (this.yieldRequested) {
      await this.markPaused(job, counts);
      return;
    }
    if (tail.error !== null) {
      await this.failRun(job, context.readingId, tail.error, counts);
      return;
    }
    this.controller = null;
    const completed = await this.jobs.setState(job.id, 'complete');
    if (!completed.ok) {
      this.failStorage(context.readingId, completed.error, counts);
      return;
    }
    this.progressSignal.set({ kind: 'complete', readingId: context.readingId, counts });
    this.logger.info('job.succeeded', { kind: 'translation', count: counts.completed });
    this.logger.info('translation.completed', {
      durationMs: this.clock.now() - this.runStartedAt,
      count: counts.completed,
      requestCount: this.requestCount,
    });
  }

  private translationContext(
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

  private async establishOpening(
    context: JobContext,
    job: AssetJob,
    counts: TranslationJobCounts,
    signal: AbortSignal,
  ): Promise<
    Result<{ context: JobContext; counts: TranslationJobCounts } | null, AiError | StorageError>
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
    if (opening.length === 0) {
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
    const outcome = await this.withPermit(opening[0].positionInReading, signal, () =>
      this.translation.run(
        opening,
        context.readingId,
        context.cacheKeys,
        context.modelId,
        PROMPT_VERSIONS.translation,
        context.taskConfig,
        signal,
        {
          ...this.translationContext(context.plan, passage),
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
        durationMs: this.clock.now() - this.runStartedAt,
        count: outcome.records.length,
      });
      for (const record of outcome.records) {
        const advanced = await this.jobs.recordCompletion(job.id, record.sentenceId);
        if (!advanced.ok) return err(advanced.error);
      }
      const nextCounts = { ...counts, completed: counts.completed + outcome.records.length };
      this.progressSignal.set({
        kind: 'running',
        readingId: context.readingId,
        counts: nextCounts,
      });
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
    const readyKeys = this.keysForPlan(context.sentences, ready);
    const records = rekey(outcome.records, readyKeys);
    const committed = await this.enrichment.commitTranslationPlan(
      ready,
      records,
      readyKeys,
      context.plan.inputFingerprint,
    );
    if (!committed.ok) return err(committed.error);
    this.logger.info('translation.first-persisted', {
      durationMs: this.clock.now() - this.runStartedAt,
      count: records.length,
    });
    for (const record of records) {
      const advanced = await this.jobs.recordCompletion(job.id, record.sentenceId);
      if (!advanced.ok) return err(advanced.error);
    }
    const nextCounts = { ...counts, completed: counts.completed + records.length };
    this.progressSignal.set({ kind: 'running', readingId: context.readingId, counts: nextCounts });
    return ok({ context: { ...context, plan: ready, cacheKeys: readyKeys }, counts: nextCounts });
  }

  private async repairGlossary(
    context: JobContext,
    job: AssetJob,
    counts: TranslationJobCounts,
    signal: AbortSignal,
  ): Promise<
    Result<{ context: JobContext; counts: TranslationJobCounts }, AiError | StorageError>
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
    const repaired = await this.withPermit(0, signal, () =>
      this.translation.repairGlossary(
        {
          ...this.translationContext(plan, translationPassageWindow(context.sentences, 0)),
          requestKind: 'glossary-repair',
          openingTranslations,
        },
        plan.promptVersion,
        context.taskConfig,
        signal,
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
    const readyKeys = this.keysForPlan(context.sentences, ready);
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
    this.progressSignal.set({ kind: 'running', readingId: context.readingId, counts: nextCounts });
    return ok({ context: { ...context, plan: ready, cacheKeys: readyKeys }, counts: nextCounts });
  }

  private async runTail(
    context: JobContext,
    job: AssetJob,
    initialCounts: TranslationJobCounts,
    signal: AbortSignal,
  ): Promise<{
    counts: TranslationJobCounts;
    error: AiError | null;
    storage: StorageError | null;
  }> {
    const plan = context.plan as ReadyTranslationPlan;
    const missing = await this.translation.missingSentenceIds(context.readingId, context.cacheKeys);
    if (!missing.ok) return { counts: initialCounts, error: null, storage: missing.error };
    const missingIds = new Set(missing.value);
    const groups = new Map<number, Sentence[]>();
    for (const sentence of context.sentences) {
      if (!missingIds.has(sentence.id)) continue;
      const group = Math.floor(sentence.positionInReading / 10);
      const bucket = groups.get(group) ?? [];
      bucket.push(sentence);
      groups.set(group, bucket);
    }
    const batches = [...groups.values()];
    let counts = initialCounts;
    let firstError: AiError | null = null;
    let storage: StorageError | null = null;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < batches.length && storage === null && !signal.aborted && !this.yieldRequested) {
        const batch = batches[next++];
        const passage = translationPassageWindow(context.sentences, batch[0].positionInReading);
        const estimatedInput = estimateTokens(
          JSON.stringify({
            title: plan.title,
            premise: plan.premise,
            register: plan.register,
            glossary: plan.glossary,
            passage: passage.map((sentence) => sentence.japaneseText),
          }),
        );
        if (estimatedInput > TRANSLATION_INPUT_BUDGET_TOKENS) {
          const oversized = aiError(
            'context-budget-exceeded',
            'translation',
            'A sentence and its translation context are too large to send.',
            { detail: { issueCode: 'single-sentence-too-large' } },
          );
          for (const sentence of batch) {
            const failed = await this.jobs.recordFailure(job.id, {
              sentenceId: sentence.id,
              errorCode: oversized.code,
              failedAt: this.clock.now(),
            });
            if (!failed.ok) {
              storage ??= failed.error;
              return;
            }
            counts = { ...counts, failed: failed.value.failedItems.length };
          }
          firstError ??= oversized;
          continue;
        }
        const outcome = await this.withPermit(batch[0].positionInReading, signal, () =>
          this.translation.run(
            batch,
            context.readingId,
            context.cacheKeys,
            context.modelId,
            plan.promptVersion,
            context.taskConfig,
            signal,
            {
              ...this.translationContext(plan, passage),
              requestKind: 'tail',
              skipCacheLookup: true,
            },
          ),
        );
        if (outcome === null) return;
        for (const record of outcome.records) {
          const stored = await this.enrichment.storeTranslationForPlan(
            record,
            context.cacheKeys,
            plan.planFingerprint,
          );
          if (!stored.ok) {
            storage ??= stored.error;
            return;
          }
          const advanced = await this.jobs.recordCompletion(job.id, record.sentenceId);
          if (!advanced.ok) {
            storage ??= advanced.error;
            return;
          }
          counts = { ...counts, completed: advanced.value.completedSentenceIds.length };
          this.progressSignal.set({ kind: 'running', readingId: context.readingId, counts });
        }
        if (outcome.failures.length > 0 && outcome.error?.code !== 'cancelled') {
          const error =
            outcome.error ?? aiError('unknown', 'translation', 'The translation request failed.');
          backOffOnRateLimit(this.pacer, error);
          for (const sentenceId of outcome.failures) {
            const failed = await this.jobs.recordFailure(job.id, {
              sentenceId,
              errorCode: error.code,
              failedAt: this.clock.now(),
            });
            if (!failed.ok) {
              storage ??= failed.error;
              return;
            }
            counts = { ...counts, failed: failed.value.failedItems.length };
          }
          firstError ??= error;
          if (!isSentenceLocalFailure(error)) return;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(MAX_ACTIVE_TRANSLATION_REQUESTS, batches.length) }, () =>
        worker(),
      ),
    );
    return { counts, error: firstError, storage };
  }

  private async withPermit<T>(
    position: number,
    signal: AbortSignal,
    run: () => Promise<T>,
  ): Promise<T | null> {
    let permit;
    try {
      permit = await this.pacer.acquire(position, 'english', signal);
    } catch {
      return null;
    }
    try {
      if (signal.aborted || this.yieldRequested) return null;
      this.requestCount += 1;
      return await run();
    } finally {
      permit.release();
    }
  }

  private async failRun(
    job: AssetJob,
    readingId: ReadingId,
    error: AiError | StorageError,
    counts: TranslationJobCounts,
  ): Promise<void> {
    const marked = await this.jobs.setState(job.id, 'failed');
    if (!marked.ok) {
      this.failStorage(readingId, marked.error, counts);
      return;
    }
    if (error.domain === 'storage') this.failStorage(readingId, error, counts);
    else this.failProvider(readingId, error, counts);
  }

  private async markPaused(job: AssetJob, counts: TranslationJobCounts): Promise<void> {
    this.yieldRequested = false;
    this.controller = null;
    const marked = await this.jobs.setState(job.id, 'paused');
    if (!marked.ok) {
      this.failStorage(job.readingId, marked.error, counts);
      return;
    }
    this.progressSignal.set({ kind: 'paused', readingId: job.readingId, counts });
  }

  private async markCancelled(job: AssetJob, counts: TranslationJobCounts): Promise<void> {
    this.controller = null;
    const marked = await this.jobs.setState(job.id, 'cancelled');
    if (!marked.ok) {
      this.failStorage(job.readingId, marked.error, counts);
      return;
    }
    this.progressSignal.set({ kind: 'cancelled', readingId: job.readingId, counts });
  }

  private report(readingId: ReadingId, error: LayerError): void {
    if (error.source === 'provider') this.failProvider(readingId, error.error, emptyCounts());
    else this.failStorage(readingId, error.error, emptyCounts());
  }

  private failProvider(readingId: ReadingId, error: AiError, counts: TranslationJobCounts): void {
    this.controller = null;
    this.progressSignal.set({
      kind: 'failed',
      readingId,
      counts,
      error: { source: 'provider', error },
    });
    this.logger.error('job.failed', {
      kind: 'translation',
      errorDomain: error.domain,
      errorCode: error.code,
    });
  }

  private failStorage(
    readingId: ReadingId,
    error: StorageError,
    counts: TranslationJobCounts,
  ): void {
    this.controller = null;
    this.progressSignal.set({
      kind: 'failed',
      readingId,
      counts,
      error: { source: 'storage', error },
    });
    this.logger.error('job.failed', {
      kind: 'translation',
      errorDomain: error.domain,
      errorCode: error.code,
    });
  }
}

function ordered(sentences: readonly Sentence[]): readonly Sentence[] {
  return [...sentences].sort((a, b) => a.positionInReading - b.positionInReading);
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

function emptyCounts(): TranslationJobCounts {
  return { total: 0, requested: 0, completed: 0, failed: 0 };
}

function isSentenceLocalFailure(error: AiError): boolean {
  return isAutomaticallyRetryable(error) || error.code === 'malformed-response';
}
