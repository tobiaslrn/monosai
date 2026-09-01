import { Injectable, inject } from '@angular/core';
import { ANALYZER_VERSION } from '../../domain/language/analyzer-version';
import type { LanguageError } from '../../domain/language/language-error';
import { languageError } from '../../domain/language/language-error';
import type { ImportDraft } from '../../domain/reading/import-draft';
import { buildImportDraft } from '../../domain/reading/import-structure';
import type { ImportSource, ImportedReading } from '../../domain/reading/reading';
import type { ImportedReadingDraft } from '../../domain/reading/reading-repository';
import { emptyCompletion, NO_GRAMMAR_REVIEW } from '../../domain/reading/summaries';
import type { Paragraph, Sentence } from '../../domain/reading/text-hierarchy';
import type { Token, TokenAnalysis } from '../../domain/reading/token';
import { countCharacters } from '../../domain/reading/import-text';
import { buildExcerpt } from '../../domain/reading/excerpt';
import { hashCanonical } from '../../domain/shared/hashing';
import { paragraphId, readingId, sentenceId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { LanguageStore } from '../language/language.store';
import { LANGUAGE_RUNTIME } from '../shared/language-tokens';
import { CLOCK, HASHER, ID_GENERATOR, READING_REPOSITORY } from '../shared/repository-tokens';

/**
 * Sentences tokenized per worker call.
 *
 * The batch is bounded so a long import reports real progress and answers a
 * cancel between chunks, rather than disappearing into one opaque request.
 */
const ANALYSIS_BATCH_SIZE = 120;

export interface AnalysisProgress {
  readonly completed: number;
  readonly total: number;
}

export interface SaveImportRequest {
  readonly draft: ImportDraft;
  readonly title: string;
  readonly sourceText: string;
  readonly importSource: ImportSource;
  readonly sourceFileName?: string;
}

/**
 * The language and persistence work behind the Add text workflow.
 *
 * It owns the order of operations — assets ready, segment, tokenize, save — so
 * the feature holds workflow state and nothing else. Nothing here touches the
 * worker client, the asset loader, or Dexie; it talks to `LanguageRuntime` and
 * the reading repository port.
 */
@Injectable({ providedIn: 'root' })
export class TextImportService {
  private readonly runtime = inject(LANGUAGE_RUNTIME);
  private readonly language = inject(LanguageStore);
  private readonly readings = inject(READING_REPOSITORY);
  private readonly clock = inject(CLOCK);
  private readonly hasher = inject(HASHER);
  private readonly ids = inject(ID_GENERATOR);

  findDuplicates(sourceText: string): Promise<Result<readonly ImportedReading[], StorageError>> {
    return this.readings.listImportedBySourceHash(
      hashCanonical(this.hasher, 'reading-source', sourceText),
    );
  }

  /**
   * Waits for the background asset preparation that startup began.
   *
   * Preparation is never awaited by navigation, so the learner can reach this
   * workflow before the bundle is ready. Joining the in-flight attempt is what
   * turns that into a short explicit wait instead of a hang or a crash.
   */
  async ensureLanguageReady(): Promise<Result<void, LanguageError>> {
    if (this.language.status() === 'ready') {
      return ok(undefined);
    }
    const ready = await this.language.initialize();
    if (ready) {
      return ok(undefined);
    }
    return err(
      this.language.lastError() ??
        languageError('assets-unavailable', 'Japanese analysis is not available yet.'),
    );
  }

  /** Segments off the main thread and groups the result into a reading draft. */
  async segment(text: string, signal?: AbortSignal): Promise<Result<ImportDraft, LanguageError>> {
    const segments = await this.runtime.segment(text, signal);
    if (!segments.ok) {
      return segments;
    }
    return ok(buildImportDraft(text, segments.value, () => this.ids.nextId()));
  }

  /**
   * Tokenizes segmented sentence texts in bounded batches, reporting progress
   * between them. Results are positional, so they are zipped back onto the ids
   * the caller asked about.
   */
  async analyzeSentences(
    sentences: readonly { readonly id: string; readonly text: string }[],
    onProgress?: (progress: AnalysisProgress) => void,
    signal?: AbortSignal,
  ): Promise<Result<ReadonlyMap<string, readonly Token[]>, LanguageError>> {
    const analyses = new Map<string, readonly Token[]>();
    const total = sentences.length;
    onProgress?.({ completed: 0, total });

    for (let start = 0; start < total; start += ANALYSIS_BATCH_SIZE) {
      const batch = sentences.slice(start, start + ANALYSIS_BATCH_SIZE);
      const analyzed = await this.runtime.analyzeSentences(
        batch.map((sentence) => sentence.text),
        signal,
      );
      if (!analyzed.ok) {
        return analyzed;
      }
      if (analyzed.value.length !== batch.length) {
        return err(
          languageError(
            'invalid-response',
            'Analysis returned a different number of sentences than were sent.',
          ),
        );
      }
      for (let index = 0; index < batch.length; index += 1) {
        analyses.set(batch[index].id, analyzed.value[index].tokens);
      }
      onProgress?.({ completed: Math.min(start + batch.length, total), total });
    }

    return ok(analyses);
  }

  /**
   * Saves the analyzed import as one immutable reading.
   *
   * Positions are assigned here, from the segmented order, and the whole graph
   * goes to the repository in a single atomic call: a reading is never visible
   * without its text and token analyses.
   */
  async save(request: SaveImportRequest): Promise<Result<ImportedReading, StorageError>> {
    const now = this.clock.now();
    const id = readingId(this.ids.nextId());

    const paragraphs: Paragraph[] = [];
    const sentences: Sentence[] = [];
    const tokenAnalyses: TokenAnalysis[] = [];
    let positionInReading = 0;

    for (const [paragraphPosition, draftParagraph] of request.draft.paragraphs.entries()) {
      const currentParagraphId = paragraphId(draftParagraph.id);
      paragraphs.push({
        id: currentParagraphId,
        readingId: id,
        position: paragraphPosition,
        sourceText: draftParagraph.sourceText,
      });

      for (const [positionInParagraph, draftSentence] of draftParagraph.sentences.entries()) {
        const currentSentenceId = sentenceId(draftSentence.id);
        sentences.push({
          id: currentSentenceId,
          readingId: id,
          paragraphId: currentParagraphId,
          positionInReading,
          positionInParagraph,
          japaneseText: draftSentence.text,
          contentHash: hashCanonical(this.hasher, 'sentence', draftSentence.text),
        });
        tokenAnalyses.push({
          sentenceId: currentSentenceId,
          analyzerVersion: ANALYZER_VERSION,
          // The import flow refuses to save while any sentence is awaiting analysis, so
          // an empty token list here means a sentence genuinely has no tokens.
          tokens: draftSentence.tokens ?? [],
        });
        positionInReading += 1;
      }
    }

    const reading: ImportedReading = {
      id,
      kind: 'imported',
      title: request.title,
      createdAt: now,
      updatedAt: now,
      sentenceCount: sentences.length,
      lastOpenedAt: null,
      characterCount: countCharacters(request.sourceText),
      excerpt: buildExcerpt(request.sourceText),
      translationSummary: emptyCompletion(sentences.length),
      grammarSummary: NO_GRAMMAR_REVIEW,
      audioSummary: emptyCompletion(sentences.length),
      analyzerVersion: ANALYZER_VERSION,
      importSource: request.importSource,
      sourceTextHash: hashCanonical(this.hasher, 'reading-source', request.sourceText),
      ...(request.sourceFileName === undefined ? {} : { sourceFileName: request.sourceFileName }),
    };

    const draft: ImportedReadingDraft = { reading, paragraphs, sentences, tokenAnalyses };
    return this.readings.saveImportedReading(draft);
  }
}
