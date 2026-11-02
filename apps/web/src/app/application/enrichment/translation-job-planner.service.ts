import { Injectable, inject } from '@angular/core';
import { aiError } from '../../domain/ai/ai-error';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import { translationConfigFingerprint } from '../../domain/enrichment/cache-keys';
import type { AssetJob, JobState } from '../../domain/enrichment/jobs';
import {
  createPendingTranslationPlan,
  passageContextFingerprint,
  translationPassageWindow,
  type TranslationPlan,
} from '../../domain/enrichment/translation-plan';
import type { Reading } from '../../domain/reading/reading';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import { jobId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import { ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { TextModelStore } from '../settings/text-model.store';
import {
  CLOCK,
  ENRICHMENT_REPOSITORY,
  HASHER,
  ID_GENERATOR,
  JOB_REPOSITORY,
  READING_REPOSITORY,
} from '../shared/repository-tokens';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { unavailable, type PlanOutcome } from './reading-job-lifecycle';
import { TranslationService } from './translation.service';

export type TranslationJobScope = 'current-configuration' | 'never-prepared';

export interface TranslationJobContext {
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

/**
 * Works out what a reading's translation job has to do: the stored plan it runs
 * under, the cache keys that plan implies, and the job row, created or resumed.
 */
@Injectable({ providedIn: 'root' })
export class TranslationJobPlanner {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly jobs = inject(JOB_REPOSITORY);
  private readonly translation = inject(TranslationService);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly textModel = inject(TextModelStore);
  private readonly grammarProfile = inject(GrammarProfileStore);
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);

  async plan(
    readingId: ReadingId,
    scope: TranslationJobScope,
    initialState: JobState,
  ): Promise<PlanOutcome<TranslationJobContext>> {
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
        return { kind: 'nothing-to-do', total: sentences.length };
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
    const context: TranslationJobContext = {
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
    if (missing.value.length === 0) return { kind: 'nothing-to-do', total: context.total };
    const created = await this.createJob(context, missing.value, initialState);
    return created.ok
      ? { kind: 'planned', context, job: created.value }
      : unavailable({ source: 'storage', error: created.error });
  }

  keysForPlan(
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
    context: TranslationJobContext,
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
    context: TranslationJobContext,
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
}

function ordered(sentences: readonly Sentence[]): readonly Sentence[] {
  return [...sentences].sort((a, b) => a.positionInReading - b.positionInReading);
}
