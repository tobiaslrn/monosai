import type { Result } from '../shared/result';
import type { ParagraphId, ReadingId, SentenceId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { ImportedReading, LibraryFilter, Reading } from './reading';
import type { Paragraph, ReadingGraph, Sentence } from './text-hierarchy';
import type { ContinueReadingTarget, ReadingProgress } from './progress';
import type { TokenAnalysis } from './token';

/** Everything persisted atomically when an imported reading is saved. */
export interface ImportedReadingDraft {
  readonly reading: ImportedReading;
  readonly paragraphs: readonly Paragraph[];
  readonly sentences: readonly Sentence[];
  readonly tokenAnalyses: readonly TokenAnalysis[];
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
  getReading(id: ReadingId): Promise<Result<Reading | null, StorageError>>;
  listLibraryPage(request: LibraryPageRequest): Promise<Result<LibraryPage, StorageError>>;
  countReadings(filter: LibraryFilter): Promise<Result<number, StorageError>>;
  loadGraph(id: ReadingId, window?: ParagraphWindow): Promise<Result<ReadingGraph, StorageError>>;
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
