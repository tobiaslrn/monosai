import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import { grammarRuleId } from '../../../domain/shared/ids';
import { isProfileEmpty } from '../../../domain/grammar/profile';
import type { CustomGrammarRule } from '../../../domain/grammar/rules';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import { uuid } from '../../../../testing/persistence-fixtures';
import type { MonosaiDatabase } from '../monosai-db';
import { DexieGrammarRepository } from './dexie-grammar.repository';
import { DexieSourceMappingRepository } from './dexie-source-mapping.repository';
import { sourceMappingId } from '../../../domain/shared/ids';

describe('DexieGrammarRepository', () => {
  let db: MonosaiDatabase;
  let repository: DexieGrammarRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repository = new DexieGrammarRepository(db, fixedClock(1_700_700_000_000));
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  function customRule(index: number, enabled = true): CustomGrammarRule {
    return {
      id: grammarRuleId(uuid(8200 + index)),
      kind: 'custom',
      name: `Custom rule ${index}`,
      description: 'Use plain form in inner clauses.',
      enabled,
      position: index,
      createdAt: 1_700_700_000_000,
      updatedAt: 1_700_700_000_000,
    };
  }

  it('selects nothing on a fresh install', async () => {
    const selection = await repository.getSelection();

    expect(selection.ok).toBe(true);
    if (!selection.ok) {
      return;
    }
    expect(isProfileEmpty(selection.value)).toBe(true);
  });

  it('stores and removes catalog selections', async () => {
    const ruleIds = [grammarRuleId('n5-wa'), grammarRuleId('n5-desu')];
    await repository.setCatalogRulesSelected(ruleIds, true);

    let selection = await repository.getSelection();
    expect(selection.ok && [...selection.value.selectedCatalogRuleIds].sort()).toEqual(
      [...ruleIds].sort(),
    );

    await repository.setCatalogRuleSelected(ruleIds[0], false);

    selection = await repository.getSelection();
    expect(selection.ok && selection.value.selectedCatalogRuleIds).toEqual([ruleIds[1]]);
    expect(await db.grammarSelections.count()).toBe(1);
  });

  it('keeps custom rules ordered and reports only enabled ones in the profile', async () => {
    await repository.saveCustomRule(customRule(0));
    await repository.saveCustomRule(customRule(1, false));

    const rules = await repository.listCustomRules();
    expect(rules.ok && rules.value.map((rule) => rule.position)).toEqual([0, 1]);

    const selection = await repository.getSelection();
    expect(selection.ok && selection.value.enabledCustomRuleIds).toHaveLength(1);
  });

  it('reorders custom rules', async () => {
    const first = customRule(0);
    const second = customRule(1);
    await repository.saveCustomRule(first);
    await repository.saveCustomRule(second);

    await repository.reorderCustomRules([second.id, first.id]);

    const rules = await repository.listCustomRules();
    expect(rules.ok && rules.value.map((rule) => rule.id)).toEqual([second.id, first.id]);
  });

  it('deletes a custom rule without touching catalog selections', async () => {
    const rule = customRule(0);
    await repository.saveCustomRule(rule);
    await repository.setCatalogRuleSelected(grammarRuleId('n5-wa'), true);

    await repository.removeCustomRule(rule.id);

    const selection = await repository.getSelection();
    expect(selection.ok && selection.value.enabledCustomRuleIds).toEqual([]);
    expect(selection.ok && selection.value.selectedCatalogRuleIds).toHaveLength(1);
  });

  it('captures a profile with resolved rule text so history cannot be rewritten', async () => {
    const capture = {
      id: uuid(8300),
      profileHash: 'profile-hash-1',
      capturedAt: 1_700_700_000_000,
      selectedCatalogRules: [
        {
          ruleId: grammarRuleId('n5-wa'),
          label: 'は (topic marker)',
          description: 'Marks the topic of the sentence.',
        },
      ],
      enabledCustomRules: [],
      structuralBaselineVersion: '1.0.0',
    };

    await repository.captureProfile(capture);
    await repository.setCatalogRuleSelected(grammarRuleId('n5-wa'), false);

    const loaded = await repository.getProfileCapture(capture.id);
    expect(loaded.ok && loaded.value?.selectedCatalogRules[0].label).toBe('は (topic marker)');
  });

  it('returns null for an unknown profile capture', async () => {
    const loaded = await repository.getProfileCapture('missing');
    expect(loaded.ok && loaded.value).toBeNull();
  });
});

describe('DexieSourceMappingRepository', () => {
  let db: MonosaiDatabase;
  let repository: DexieSourceMappingRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repository = new DexieSourceMappingRepository(db);
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  const mapping = {
    id: sourceMappingId(uuid(8400)),
    providerKind: 'desktop-connect' as const,
    deckName: 'Core Japanese',
    deckScope: 'deck-and-subdecks' as const,
    noteTypeName: 'Basic',
    expressionFieldName: 'Expression',
    enabled: true,
    createdAt: 1_700_700_000_000,
    updatedAt: 1_700_700_000_000,
  };

  it('stores a mapping with its exact deck scope', async () => {
    await repository.save(mapping);

    const listed = await repository.list();
    expect(listed.ok && listed.value[0].deckScope).toBe('deck-and-subdecks');
  });

  it('toggles enablement without losing configuration', async () => {
    await repository.save(mapping);

    const disabled = await repository.setEnabled(mapping.id, false);

    expect(disabled.ok && disabled.value.enabled).toBe(false);
    expect(disabled.ok && disabled.value.expressionFieldName).toBe('Expression');
  });

  it('reports a missing mapping instead of creating one', async () => {
    const missing = await repository.setEnabled(sourceMappingId(uuid(8499)), false);

    expect(missing.ok).toBe(false);
    if (missing.ok) {
      return;
    }
    expect(missing.error.code).toBe('not-found');
    expect(await db.sourceMappings.count()).toBe(0);
  });

  it('removes a mapping', async () => {
    await repository.save(mapping);
    await repository.remove(mapping.id);

    const listed = await repository.list();
    expect(listed.ok && listed.value).toEqual([]);
  });
});
