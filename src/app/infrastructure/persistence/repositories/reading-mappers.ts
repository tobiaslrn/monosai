import type { GenerationProvenance } from '../../../domain/ai/generation-provenance';
import type { Reading } from '../../../domain/reading/reading';
import type { FrozenSentenceValidation } from '../../../domain/reading/validation';
import type { Paragraph, Sentence } from '../../../domain/reading/text-hierarchy';
import type { TokenAnalysis } from '../../../domain/reading/token';
import type { ReadingId } from '../../../domain/shared/ids';
import { ROW_VERSION } from '../schemas/common.schema';
import type { FrozenValidationRow, GenerationProvenanceRow } from '../schemas/generation.schema';
import type {
  ParagraphRow,
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

export function toFrozenValidationRow(
  validation: FrozenSentenceValidation,
  readingId: ReadingId,
): FrozenValidationRow {
  return {
    v: ROW_VERSION,
    sentenceId: validation.sentenceId,
    readingId,
    snapshotId: validation.snapshotId,
    validatorVersion: validation.validatorVersion,
    tokenStatuses: validation.tokenStatuses,
  };
}

export function toFrozenValidation(row: FrozenValidationRow): FrozenSentenceValidation {
  return {
    sentenceId: row.sentenceId,
    snapshotId: row.snapshotId,
    validatorVersion: row.validatorVersion,
    tokenStatuses: row.tokenStatuses,
  };
}

export function toGenerationProvenanceRow(
  provenance: GenerationProvenance,
): GenerationProvenanceRow {
  return { ...provenance, v: ROW_VERSION };
}

export function toGenerationProvenance(row: GenerationProvenanceRow): GenerationProvenance {
  const { v: _version, ...provenance } = row;
  return provenance;
}
