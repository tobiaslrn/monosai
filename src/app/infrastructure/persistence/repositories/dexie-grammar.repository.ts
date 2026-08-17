import type { Clock } from '../../../domain/shared/clock';
import { ok, type Result } from '../../../domain/shared/result';
import type { GrammarRuleId } from '../../../domain/shared/ids';
import type {
  GrammarProfileSelection,
  GrammarProfileSnapshot,
} from '../../../domain/grammar/profile';
import type { GrammarRepository } from '../../../domain/grammar/grammar-repository';
import type { CustomGrammarRule } from '../../../domain/grammar/rules';
import type { StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecord, parseRecords } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import {
  customGrammarRuleRowSchema,
  grammarProfileSnapshotRowSchema,
  grammarSelectionRowSchema,
  type CustomGrammarRuleRow,
} from '../schemas/grammar.schema';
import { runStorage } from './storage-operation';

/**
 * Live grammar profile storage.
 *
 * A selection row exists only while its catalog rule is selected, so a fresh
 * install starts with nothing selected and deselection leaves no residue.
 */
export class DexieGrammarRepository implements GrammarRepository {
  constructor(
    private readonly db: MonosaiDatabase,
    private readonly clock: Clock,
  ) {}

  async getSelection(): Promise<Result<GrammarProfileSelection, StorageError>> {
    const selections = await runStorage('grammarSelections.list', () =>
      this.db.grammarSelections.toArray(),
    );
    if (!selections.ok) {
      return selections;
    }
    const parsedSelections = parseRecords(
      grammarSelectionRowSchema,
      selections.value,
      'grammarSelections',
    );
    if (!parsedSelections.ok) {
      return parsedSelections;
    }

    const customRules = await this.listCustomRules();
    if (!customRules.ok) {
      return customRules;
    }

    return ok({
      selectedCatalogRuleIds: parsedSelections.value.map((row) => row.ruleId),
      enabledCustomRuleIds: customRules.value.filter((rule) => rule.enabled).map((rule) => rule.id),
    });
  }

  setCatalogRuleSelected(
    ruleId: GrammarRuleId,
    selected: boolean,
  ): Promise<Result<void, StorageError>> {
    return this.setCatalogRulesSelected([ruleId], selected);
  }

  setCatalogRulesSelected(
    ruleIds: readonly GrammarRuleId[],
    selected: boolean,
  ): Promise<Result<void, StorageError>> {
    return runStorage('grammarSelections.set', async () => {
      await this.db.transaction('rw', this.db.grammarSelections, async () => {
        if (selected) {
          await this.db.grammarSelections.bulkPut(
            ruleIds.map((ruleId) => ({
              v: ROW_VERSION,
              ruleId,
              selectedAt: this.clock.now(),
            })),
          );
        } else {
          await this.db.grammarSelections.bulkDelete([...ruleIds]);
        }
      });
    });
  }

  async listCustomRules(): Promise<Result<readonly CustomGrammarRule[], StorageError>> {
    const loaded = await runStorage('customGrammarRules.list', () =>
      this.db.customGrammarRules.orderBy('position').toArray(),
    );
    if (!loaded.ok) {
      return loaded;
    }
    const parsed = parseRecords(customGrammarRuleRowSchema, loaded.value, 'customGrammarRules');
    return parsed.ok ? ok(parsed.value.map(toCustomRule)) : parsed;
  }

  async saveCustomRule(rule: CustomGrammarRule): Promise<Result<CustomGrammarRule, StorageError>> {
    const { kind: _kind, ...stored } = rule;
    const written = await runStorage('customGrammarRules.put', () =>
      this.db.customGrammarRules.put({ ...stored, v: ROW_VERSION }),
    );
    return written.ok ? ok(rule) : written;
  }

  removeCustomRule(ruleId: GrammarRuleId): Promise<Result<void, StorageError>> {
    return runStorage('customGrammarRules.delete', async () => {
      await this.db.customGrammarRules.delete(ruleId);
    });
  }

  reorderCustomRules(orderedIds: readonly GrammarRuleId[]): Promise<Result<void, StorageError>> {
    return runStorage('customGrammarRules.reorder', async () => {
      await this.db.transaction('rw', this.db.customGrammarRules, async () => {
        for (const [position, id] of orderedIds.entries()) {
          await this.db.customGrammarRules.update(id, {
            position,
            updatedAt: this.clock.now(),
          });
        }
      });
    });
  }

  async captureProfile(
    snapshot: GrammarProfileSnapshot,
  ): Promise<Result<GrammarProfileSnapshot, StorageError>> {
    const written = await runStorage('grammarProfileSnapshots.put', () =>
      this.db.grammarProfileSnapshots.put({ ...snapshot, v: ROW_VERSION }),
    );
    return written.ok ? ok(snapshot) : written;
  }

  async getProfileCapture(
    id: string,
  ): Promise<Result<GrammarProfileSnapshot | null, StorageError>> {
    const loaded = await runStorage('grammarProfileSnapshots.get', () =>
      this.db.grammarProfileSnapshots.get(id),
    );
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(null);
    }
    const parsed = parseRecord(
      grammarProfileSnapshotRowSchema,
      loaded.value,
      'grammarProfileSnapshots',
    );
    if (!parsed.ok) {
      return parsed;
    }
    const { v: _version, ...capture } = parsed.value;
    return ok(capture);
  }
}

function toCustomRule(row: CustomGrammarRuleRow): CustomGrammarRule {
  const { v: _version, ...rule } = row;
  return { ...rule, kind: 'custom' };
}
