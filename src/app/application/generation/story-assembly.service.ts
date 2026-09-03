import { Injectable, inject } from '@angular/core';
import type { GenerationProvenance } from '../../domain/ai/generation-provenance';
import { promptVersionRecord } from '../../domain/ai/prompt-versions';
import { ANALYZER_VERSION } from '../../domain/language/analyzer-version';
import { buildExcerpt } from '../../domain/reading/excerpt';
import { countCharacters } from '../../domain/reading/import-text';
import type { GeneratedStory, StoryForm } from '../../domain/reading/reading';
import type { GeneratedStoryDraft } from '../../domain/reading/reading-repository';
import { concernCount } from '../../domain/enrichment/grammar-normalization';
import {
  emptyCompletion,
  grammarComplete,
  grammarUnavailable,
  NO_GRAMMAR_REVIEW,
} from '../../domain/reading/summaries';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import type { Paragraph, Sentence } from '../../domain/reading/text-hierarchy';
import type { Token, TokenAnalysis } from '../../domain/reading/token';
import type {
  FrozenSentenceValidation,
  TokenStatusAssignment,
} from '../../domain/reading/validation';
import { hashCanonical } from '../../domain/shared/hashing';
import { paragraphId, readingId, sentenceId } from '../../domain/shared/ids';
import type { SnapshotId, VocabularyItemId } from '../../domain/shared/ids';
import type { AnkiWordPriorityMode } from '../../domain/settings/settings';
import type { Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import type { GrammarRunOutcome } from '../enrichment/grammar-analysis.service';
import type { TranslationRunOutcome } from '../enrichment/translation.service';
import { CLOCK, HASHER, ID_GENERATOR, READING_REPOSITORY } from '../shared/repository-tokens';

/** One accepted sentence with the analysis and statuses it was accepted on. */
export interface AcceptedSentence {
  readonly textJa: string;
  readonly tokens: readonly Token[];
  readonly statuses: readonly TokenStatusAssignment[];
}

/**
 * Everything an accepted story needs to become rows.
 *
 * It carries the captured context rather than reading it back from the stores,
 * because the specification is explicit that later setting changes do not
 * affect a job that is already running.
 */
export interface AcceptedStory {
  readonly titleJa: string;
  readonly sentences: readonly AcceptedSentence[];
  readonly form: StoryForm;
  readonly premise: string;
  readonly specialInstructions?: string;
  readonly snapshotId: SnapshotId;
  readonly validatorVersion: string;
  readonly grammarProfileSnapshotId: string;
  readonly exceptionPolicyHash: string;
  readonly modelId: string;
  readonly requestedSentenceCount: number;
  readonly repairAttempts: number;
  readonly suggestedVocabularyItemIds: readonly VocabularyItemId[];
  readonly ankiWordPriorityMode?: AnkiWordPriorityMode;
  readonly exceptionCount: number;
  /** What the learner asked this story to be prepared with, at the time it was written. */
  readonly preparationTargets: readonly PreparationLayer[];
}

/**
 * Turns an accepted candidate into the rows one transaction writes.
 *
 * Deliberately shaped like `TextImportService.save`: the same id assignment,
 * the same content hashing, the same single atomic call. A generated story adds
 * the frozen validation and the provenance, and holds its whole text in one
 * paragraph, because the model returns an ordered list of sentences and not the
 * blank-line structure a learner's own text carries (see ADR 0019).
 *
 * The auxiliary summaries start empty here. Grammar review and translation are
 * Milestone 8 and fill these branches in on top of this save path; a story
 * saved today reads as "no translations yet", which is exactly true.
 */
@Injectable({ providedIn: 'root' })
export class StoryAssemblyService {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly clock = inject(CLOCK);
  private readonly hasher = inject(HASHER);
  private readonly ids = inject(ID_GENERATOR);

  build(accepted: AcceptedStory): GeneratedStoryDraft {
    const now = this.clock.now();
    const id = readingId(this.ids.nextId());
    const onlyParagraphId = paragraphId(this.ids.nextId());
    const provenanceId = this.ids.nextId();

    const sentences: Sentence[] = [];
    const tokenAnalyses: TokenAnalysis[] = [];
    const frozenValidations: FrozenSentenceValidation[] = [];

    for (const [position, accepted_] of accepted.sentences.entries()) {
      const currentSentenceId = sentenceId(this.ids.nextId());
      sentences.push({
        id: currentSentenceId,
        readingId: id,
        paragraphId: onlyParagraphId,
        positionInReading: position,
        positionInParagraph: position,
        japaneseText: accepted_.textJa,
        contentHash: hashCanonical(this.hasher, 'sentence', accepted_.textJa),
      });
      tokenAnalyses.push({
        sentenceId: currentSentenceId,
        analyzerVersion: ANALYZER_VERSION,
        tokens: accepted_.tokens,
      });
      frozenValidations.push({
        sentenceId: currentSentenceId,
        snapshotId: accepted.snapshotId,
        validatorVersion: accepted.validatorVersion,
        tokenStatuses: accepted_.statuses,
      });
    }

    const sourceText = accepted.sentences.map((sentence) => sentence.textJa).join('');
    const paragraph: Paragraph = {
      id: onlyParagraphId,
      readingId: id,
      position: 0,
      sourceText,
    };

    const reading: GeneratedStory = {
      id,
      kind: 'generated',
      title: accepted.titleJa,
      createdAt: now,
      updatedAt: now,
      sentenceCount: sentences.length,
      lastOpenedAt: null,
      characterCount: countCharacters(sourceText),
      excerpt: buildExcerpt(sourceText),
      translationSummary: emptyCompletion(sentences.length),
      grammarSummary: NO_GRAMMAR_REVIEW,
      audioSummary: emptyCompletion(sentences.length),
      preparationTargets: accepted.preparationTargets,
      analyzerVersion: ANALYZER_VERSION,
      form: accepted.form,
      premise: accepted.premise,
      snapshotId: accepted.snapshotId,
      generationProvenanceId: provenanceId,
      validationOutcome:
        accepted.exceptionCount === 0
          ? { kind: 'strict' }
          : { kind: 'exception', exceptionCount: accepted.exceptionCount },
      ...(accepted.specialInstructions === undefined
        ? {}
        : { specialInstructions: accepted.specialInstructions }),
    };

    const provenance: GenerationProvenance = {
      id: provenanceId,
      readingId: id,
      snapshotId: accepted.snapshotId,
      grammarProfileSnapshotId: accepted.grammarProfileSnapshotId,
      exceptionPolicyHash: accepted.exceptionPolicyHash,
      modelId: accepted.modelId,
      promptVersions: promptVersionRecord(),
      requestedSentenceCount: accepted.requestedSentenceCount,
      repairAttempts: accepted.repairAttempts,
      suggestedVocabularyItemIds: accepted.suggestedVocabularyItemIds,
      ankiWordPriorityMode: accepted.ankiWordPriorityMode ?? 'uniform',
      createdAt: now,
    };

    return {
      reading,
      paragraphs: [paragraph],
      sentences,
      tokenAnalyses,
      frozenValidations,
      provenance,
      translations: [],
      grammarAnalyses: [],
    };
  }

  /**
   * Merges the concurrent grammar/translation results into the built draft.
   *
   * The result must satisfy `assertEnrichmentConsistent`: the translation
   * summary's `completed` count always equals `translation.records.length`,
   * and a `complete` grammar status only ever comes from a run that produced
   * exactly one record per sentence (`GrammarAnalysisService.run` guarantees
   * this), so `grammarAnalyses.length` matches `sentences.length` whenever the
   * summary claims completion.
   */
  withAuxiliary(
    draft: GeneratedStoryDraft,
    grammar: GrammarRunOutcome,
    translation: TranslationRunOutcome,
  ): GeneratedStoryDraft {
    const translationSummary = {
      total: draft.sentences.length,
      completed: translation.records.length,
      failed: translation.failures.length,
    };

    const grammarSummary =
      grammar.status === 'unavailable'
        ? grammarUnavailable(grammar.reasonCode)
        : grammarComplete(concernCount(grammar.records.flatMap((record) => record.findings)));

    return {
      ...draft,
      reading: { ...draft.reading, translationSummary, grammarSummary },
      translations: translation.records,
      grammarAnalyses: grammar.records,
    };
  }

  save(draft: GeneratedStoryDraft): Promise<Result<GeneratedStory, StorageError>> {
    return this.readings.saveGeneratedStory(draft);
  }
}
