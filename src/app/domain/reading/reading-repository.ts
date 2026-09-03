import type { Result } from '../shared/result';
import type { ParagraphId, ReadingId, SentenceId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { GenerationProvenance } from '../ai/generation-provenance';
import type { GrammarAnalysisRecord, TranslationRecord } from '../enrichment/records';
import type { PreparationLayer } from '../enrichment/preparation';
import type { GeneratedStory, ImportedReading, LibraryFilter, Reading } from './reading';
import type { FrozenSentenceValidation } from './validation';
import type { Paragraph, ReadingGraph, Sentence } from './text-hierarchy';
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
  readonly translations: readonly TranslationRecord[];
  readonly grammarAnalyses: readonly GrammarAnalysisRecord[];
}

/** A sentence's identity, content hash, and position — enough to tell whether
 * a cached enrichment row is still current, without loading its text. */
export interface SentenceRef {
  readonly id: SentenceId;
  readonly contentHash: string;
  readonly positionInReading: number;
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
  /** Finds an existing imported reading before duplicate text is analysed again. */
  listImportedBySourceHash(
    sourceTextHash: string,
  ): Promise<Result<readonly ImportedReading[], StorageError>>;
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
  setPreparationTargets(
    id: ReadingId,
    targets: readonly PreparationLayer[],
  ): Promise<Result<Reading, StorageError>>;
  listLibraryPage(request: LibraryPageRequest): Promise<Result<LibraryPage, StorageError>>;
  countReadings(filter: LibraryFilter): Promise<Result<number, StorageError>>;
  loadGraph(id: ReadingId, window?: ParagraphWindow): Promise<Result<ReadingGraph, StorageError>>;
  /**
   * Number of paragraphs, so the reader can size its window without loading the
   * text of a reading it is about to render a few paragraphs of.
   */
  countParagraphs(id: ReadingId): Promise<Result<number, StorageError>>;
  loadTokenAnalyses(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly TokenAnalysis[], StorageError>>;
  /** Sentence identity, content hash, and position only — for cache-key checks. */
  listSentenceRefs(readingId: ReadingId): Promise<Result<readonly SentenceRef[], StorageError>>;
  /**
   * The Japanese of specific sentences, in the order they appear in the
   * reading. A whole-reading job resolves which sentences it still needs from
   * `listSentenceRefs` first, so this only ever loads the text it will send.
   */
  loadSentences(
    sentenceIds: readonly SentenceId[],
  ): Promise<Result<readonly Sentence[], StorageError>>;
  deleteReading(id: ReadingId): Promise<Result<void, StorageError>>;
  markOpened(id: ReadingId, openedAt: number): Promise<Result<void, StorageError>>;
}

export type { ParagraphId, SentenceId };
