import type { GrammarRuleId } from '../shared/ids';

export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

/** Easiest first. Records where a pattern is conventionally taught. */
export const JLPT_LEVELS_EASIEST_FIRST: readonly JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

export interface CatalogGrammarRule {
  readonly id: GrammarRuleId;
  readonly kind: 'catalog';
  readonly level: JlptLevel;
  readonly pattern: string;
  readonly nameEn: string;
  readonly descriptionEn: string;
  readonly formation?: string;
  readonly exampleJa?: string;
  readonly exampleEn?: string;
  readonly searchAliases?: readonly string[];
  readonly sourceId: string;
  readonly catalogVersion: string;
}
