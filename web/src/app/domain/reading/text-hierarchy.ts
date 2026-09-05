import type { ParagraphId, ReadingId, SentenceId } from '../shared/ids';

export interface Paragraph {
  readonly id: ParagraphId;
  readonly readingId: ReadingId;
  readonly position: number;
  readonly sourceText: string;
}

export interface Sentence {
  readonly id: SentenceId;
  readonly readingId: ReadingId;
  readonly paragraphId: ParagraphId;
  readonly positionInReading: number;
  readonly positionInParagraph: number;
  readonly japaneseText: string;
  readonly contentHash: string;
}

/** A reading's immutable text, loaded as a bounded window for long content. */
export interface ReadingGraph {
  readonly paragraphs: readonly Paragraph[];
  readonly sentences: readonly Sentence[];
}
