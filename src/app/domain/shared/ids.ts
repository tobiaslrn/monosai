import type { Brand } from './brand';

export type ReadingId = Brand<string, 'ReadingId'>;
export type ParagraphId = Brand<string, 'ParagraphId'>;
export type SentenceId = Brand<string, 'SentenceId'>;
export type SnapshotId = Brand<string, 'SnapshotId'>;
export type VocabularyItemId = Brand<string, 'VocabularyItemId'>;
export type GrammarRuleId = Brand<string, 'GrammarRuleId'>;
export type SourceMappingId = Brand<string, 'SourceMappingId'>;
export type AssetId = Brand<string, 'AssetId'>;
export type JobId = Brand<string, 'JobId'>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Port for creating opaque identifiers. Implementations must produce UUIDs. */
export interface IdGenerator {
  nextId(): string;
}

export const readingId = (value: string): ReadingId => value as ReadingId;
export const paragraphId = (value: string): ParagraphId => value as ParagraphId;
export const sentenceId = (value: string): SentenceId => value as SentenceId;
export const snapshotId = (value: string): SnapshotId => value as SnapshotId;
export const vocabularyItemId = (value: string): VocabularyItemId => value as VocabularyItemId;
export const grammarRuleId = (value: string): GrammarRuleId => value as GrammarRuleId;
export const sourceMappingId = (value: string): SourceMappingId => value as SourceMappingId;
export const assetId = (value: string): AssetId => value as AssetId;
export const jobId = (value: string): JobId => value as JobId;
