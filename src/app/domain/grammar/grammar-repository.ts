import type { Result } from '../shared/result';
import type { GrammarRuleId } from '../shared/ids';
import type { StorageError } from '../storage/storage-error';
import type { GrammarProfileSelection, GrammarProfileSnapshot } from './profile';
import type { CustomGrammarRule } from './rules';

export interface GrammarRepository {
  getSelection(): Promise<Result<GrammarProfileSelection, StorageError>>;
  setCatalogRuleSelected(
    ruleId: GrammarRuleId,
    selected: boolean,
  ): Promise<Result<void, StorageError>>;
  setCatalogRulesSelected(
    ruleIds: readonly GrammarRuleId[],
    selected: boolean,
  ): Promise<Result<void, StorageError>>;

  listCustomRules(): Promise<Result<readonly CustomGrammarRule[], StorageError>>;
  saveCustomRule(rule: CustomGrammarRule): Promise<Result<CustomGrammarRule, StorageError>>;
  removeCustomRule(ruleId: GrammarRuleId): Promise<Result<void, StorageError>>;
  reorderCustomRules(orderedIds: readonly GrammarRuleId[]): Promise<Result<void, StorageError>>;

  captureProfile(
    snapshot: GrammarProfileSnapshot,
  ): Promise<Result<GrammarProfileSnapshot, StorageError>>;
  getProfileCapture(id: string): Promise<Result<GrammarProfileSnapshot | null, StorageError>>;
}
