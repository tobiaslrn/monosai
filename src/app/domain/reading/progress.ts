import type { ParagraphId, ReadingId, SentenceId } from '../shared/ids';

/**
 * Reading position anchored to stable paragraph and sentence identity rather
 * than a scroll offset, so it survives re-render and migration.
 */
export interface ReadingProgress {
  readonly readingId: ReadingId;
  readonly paragraphId: ParagraphId;
  readonly sentenceId: SentenceId;
  readonly positionInReading: number;
  readonly lastOpenedAt: number;
  readonly updatedAt: number;
}

export interface ContinueReadingTarget {
  readonly readingId: ReadingId;
  readonly title: string;
  readonly progress: ReadingProgress | null;
  readonly sentenceCount: number;
}
