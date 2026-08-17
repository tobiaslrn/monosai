import type { GrammarRuleId } from '../shared/ids';

/** Resolved rule text captured with a generated story so catalog updates cannot rewrite history. */
export interface CapturedGrammarRule {
  readonly ruleId: GrammarRuleId;
  readonly label: string;
  readonly description: string;
  readonly exampleJa?: string;
}

export interface GrammarProfileSnapshot {
  readonly id: string;
  readonly profileHash: string;
  readonly capturedAt: number;
  readonly selectedCatalogRules: readonly CapturedGrammarRule[];
  readonly enabledCustomRules: readonly CapturedGrammarRule[];
  readonly structuralBaselineVersion: string;
}

/** The learner's live selection. Empty on a fresh install. */
export interface GrammarProfileSelection {
  readonly selectedCatalogRuleIds: readonly GrammarRuleId[];
  readonly enabledCustomRuleIds: readonly GrammarRuleId[];
}

export function isProfileEmpty(selection: GrammarProfileSelection): boolean {
  return (
    selection.selectedCatalogRuleIds.length === 0 && selection.enabledCustomRuleIds.length === 0
  );
}
