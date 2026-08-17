import type { z } from 'zod';
import type {
  paragraphRowSchema,
  readingProgressRowSchema,
  readingRowSchema,
  sentenceRowSchema,
  tokenAnalysisRowSchema,
} from './schemas/reading.schema';

export type ReadingRow = z.infer<typeof readingRowSchema>;
export type ParagraphRow = z.infer<typeof paragraphRowSchema>;
export type SentenceRow = z.infer<typeof sentenceRowSchema>;
export type TokenAnalysisRow = z.infer<typeof tokenAnalysisRowSchema>;
export type ReadingProgressRow = z.infer<typeof readingProgressRowSchema>;

/** Key/value settings rows keep one validated payload per concern. */
export interface SettingsRow {
  readonly key: string;
  readonly v: number;
  readonly value: unknown;
}

/**
 * The credential row is deliberately isolated in its own table so ordinary
 * diagnostics, exports, and repositories never touch it.
 */
export interface CredentialRow {
  readonly key: 'openrouter';
  readonly v: number;
  readonly apiKey: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}
