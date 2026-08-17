import type { Reading } from '../../../domain/reading/reading';
import type { Paragraph, Sentence } from '../../../domain/reading/text-hierarchy';
import type { ReadingProgress } from '../../../domain/reading/progress';
import type { TokenAnalysis } from '../../../domain/reading/token';
import type { ReadingId } from '../../../domain/shared/ids';
import { ROW_VERSION } from '../schemas/common.schema';
import type {
  ParagraphRow,
  ReadingProgressRow,
  ReadingRow,
  SentenceRow,
  TokenAnalysisRow,
} from '../rows';

export function toReadingRow(reading: Reading): ReadingRow {
  return { ...reading, v: ROW_VERSION };
}

export function toReading(row: ReadingRow): Reading {
  const { v: _version, ...reading } = row;
  return reading;
}

export function toParagraphRow(paragraph: Paragraph): ParagraphRow {
  return { ...paragraph, v: ROW_VERSION };
}

export function toParagraph(row: ParagraphRow): Paragraph {
  const { v: _version, ...paragraph } = row;
  return paragraph;
}

export function toSentenceRow(sentence: Sentence): SentenceRow {
  return { ...sentence, v: ROW_VERSION };
}

export function toSentence(row: SentenceRow): Sentence {
  const { v: _version, ...sentence } = row;
  return sentence;
}

export function toTokenAnalysisRow(
  analysis: TokenAnalysis,
  readingId: ReadingId,
): TokenAnalysisRow {
  return {
    v: ROW_VERSION,
    sentenceId: analysis.sentenceId,
    readingId,
    analyzerVersion: analysis.analyzerVersion,
    tokens: analysis.tokens,
  };
}

export function toTokenAnalysis(row: TokenAnalysisRow): TokenAnalysis {
  return {
    sentenceId: row.sentenceId,
    analyzerVersion: row.analyzerVersion,
    tokens: row.tokens,
  };
}

export function toProgressRow(progress: ReadingProgress): ReadingProgressRow {
  return { ...progress, v: ROW_VERSION };
}

export function toProgress(row: ReadingProgressRow): ReadingProgress {
  const { v: _version, ...progress } = row;
  return progress;
}
