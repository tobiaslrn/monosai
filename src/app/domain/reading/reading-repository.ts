import type { Result } from '../shared/result';
import type { ParagraphId, ReadingId, SentenceId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { GenerationProvenance } from '../ai/generation-provenance';
import type { GeneratedStory, ImportedReading, LibraryFilter, Reading } from './reading';
import type { FrozenSentenceValidation } from './validation';
import type { Paragraph, ReadingGraph, Sentence } from './text-hierarchy';
import type { ContinueReadingTarget, ReadingProgress } from './progress';
import type { SentenceLocation } from './reading-position';
import type { TokenAnalysis } from './token';

/** Everything persisted atomically when an imported reading is saved. */
export interface ImportedReadingDraft {
  readonly reading: ImportedReading;
  readonly paragraphs: readonly Paragraph[];
  readonly sentences: readonly Sentence[];
  readonly tokenAnalyses: readonly TokenAnalysis[];
}

/**
 * Everything persisted atomically when a generated story is accepted.
 *
 * It mirrors `ImportedReadingDraft` and adds the two things a generated story
 * cannot exist without: the frozen validation of every sentence, and the
 * provenance that says which snapshot, profile, policy, model, and prompts
 * produced it. Both are written in the same transaction as the text, so a
 * story is never visible without the evidence that it was validated.
 */
export interface GeneratedStoryDraft {
  readonly reading: GeneratedStory;
  readonly paragraphs: readonly Paragraph[];
  readonly sentences: readonly Sentence[];
  readonly tokenAnalyses: readonly TokenAnalysis[];
  readonly frozenValidations: readonly FrozenSentenceValidation[];
  readonly provenance: GenerationProvenance;
}

export interface LibraryPageRequest {
  readonly filter: LibraryFilter;
  readonly limit: number;
  /** Exclusive cursor: the `createdAt` of the last item on the previous page. */
  readonly createdBefore?: number;
}

export interface LibraryPage {
  readonly items: readonly Reading[];
  readonly hasMore: boolean;
}

export interface ParagraphWindow {
  readonly firstParagraphPosition: number;
  readonly paragraphCount: number;
}

/**
 * Reading persistence. `deleteReading` owns cascade semantics; callers never
 * delete child tables one by one.
 */
export interface ReadingRepository {
  saveImportedReading(draft: ImportedReadingDraft): Promise<Result<ImportedReading, StorageError>>;
  /**
   * Writes an accepted story and its evidence in one transaction.
   *
   * The repository refuses a draft whose frozen validation still contains an
   * `unknown` category, which is the storage-level half of "no unknown-containing
   * result can enter the library": the state machine also refuses, and neither
   * relies on the other having remembered to.
   */
  saveGeneratedStory(draft: GeneratedStoryDraft): Promise<Result<GeneratedStory, StorageError>>;
  getReading(id: ReadingId): Promise<Result<Reading | null, StorageError>>;
  listLibraryPage(request: LibraryPageRequest): Promise<Result<LibraryPage, StorageError>>;
  countReadings(filter: LibraryFilter): Promise<Result<number, StorageError>>;
  loadGraph(id: ReadingId, window?: ParagraphWindow): Promise<Result<ReadingGraph, StorageError>>;
  /**
   * Number of paragraphs, so the reader can size its window without loading the
   * text of a reading it is about to render a few paragraphs of.
   */
  countParagraphs(id: ReadingId): Promise<Result<number, StorageError>>;
  /**
   * Resolves one sentence position through bounded indexed lookups. Resume uses
   * it instead of scanning the reading to find where a saved position landed.
   */
  locateSentence(
    id: ReadingId,
    positionInReading: number,
  ): Promise<Result<SentenceLocation | null, StorageError>>;
  loadTokenAnalyses(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly TokenAnalysis[], StorageError>>;
  deleteReading(id: ReadingId): Promise<Result<void, StorageError>>;
  saveProgress(progress: ReadingProgress): Promise<Result<void, StorageError>>;
  getProgress(id: ReadingId): Promise<Result<ReadingProgress | null, StorageError>>;
  resolveContinueReading(): Promise<Result<ContinueReadingTarget | null, StorageError>>;
  markOpened(id: ReadingId, openedAt: number): Promise<Result<void, StorageError>>;
}

export type { ParagraphId, SentenceId };
