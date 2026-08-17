import type { SentenceId, SnapshotId, VocabularyItemId } from '../shared/ids';

export interface TokenSpan {
  readonly startTokenIndex: number;
  readonly endTokenIndex: number;
}

export type UnknownReason = 'not-in-vocabulary' | 'rejected-by-policy' | 'unresolved-after-repair';

/**
 * Why a token counts as readable. Ordinary categories are decided locally;
 * `policy-exception` is the only AI-influenced category and stays visibly
 * distinct in the reader.
 */
export type TokenValidation =
  | { readonly category: 'punctuation' }
  | { readonly category: 'anki-exact'; readonly vocabularyItemIds: readonly VocabularyItemId[] }
  | {
      readonly category: 'anki-normalized';
      readonly vocabularyItemIds: readonly VocabularyItemId[];
      readonly basis: string;
    }
  | {
      readonly category: 'anki-phrase';
      readonly vocabularyItemId: VocabularyItemId;
      readonly tokenSpan: TokenSpan;
    }
  | { readonly category: 'structural-baseline'; readonly ruleId: string }
  | {
      readonly category: 'entity';
      readonly entityKind: 'name' | 'number' | 'date' | 'time' | 'symbol';
    }
  | {
      readonly category: 'policy-exception';
      readonly exceptionId: string;
      readonly explanationEn: string;
    }
  | { readonly category: 'not-in-snapshot' }
  | { readonly category: 'unknown'; readonly reason: UnknownReason };

export type TokenValidationCategory = TokenValidation['category'];

export interface TokenStatusAssignment {
  readonly tokenId: string;
  readonly validation: TokenValidation;
}

/** Frozen generated-story validation; accepted stories never contain `unknown`. */
export interface FrozenSentenceValidation {
  readonly sentenceId: SentenceId;
  readonly snapshotId: SnapshotId;
  readonly validatorVersion: string;
  readonly tokenStatuses: readonly TokenStatusAssignment[];
}

export function isAcceptedCategory(category: TokenValidationCategory): boolean {
  return category !== 'unknown';
}
