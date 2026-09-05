import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import { sourceMappingId } from '../../../domain/shared/ids';
import { DEFAULT_GRAMMAR_PROFILE_SELECTION } from '../../../domain/grammar/profile';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import { uuid } from '../../../../testing/persistence-fixtures';
import type { MonosaiDatabase } from '../monosai-db';
import { DexieGrammarRepository } from './dexie-grammar.repository';
import { DexieSourceMappingRepository } from './dexie-source-mapping.repository';

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

  it('reads the default preset on a fresh install so generation is never gated', async () => {
    const selection = await repository.getSelection();

    expect(selection.ok).toBe(true);
    if (!selection.ok) {
      return;
    }
    expect(selection.value).toEqual(DEFAULT_GRAMMAR_PROFILE_SELECTION);
    expect(selection.value.presetId).toBe('mn-preset-starter');
  });

  it('stores a preset and register preference', async () => {
    await repository.setSelection({
      presetId: 'mn-preset-everyday',
      registerPreference: 'spoken',
    });

    const selection = await repository.getSelection();
    expect(selection.ok && selection.value.presetId).toBe('mn-preset-everyday');
    expect(selection.ok && selection.value.registerPreference).toBe('spoken');
    expect(selection.ok && selection.value.customGuidance).toBeUndefined();
  });

  it('replaces the profile rather than accumulating rows', async () => {
    await repository.setSelection({ presetId: 'mn-preset-basic', registerPreference: 'either' });
    await repository.setSelection({ presetId: 'mn-preset-formal', registerPreference: 'written' });

    const selection = await repository.getSelection();
    expect(selection.ok && selection.value.presetId).toBe('mn-preset-formal');
    expect(await db.grammarProfile.count()).toBe(1);
  });

  it('round-trips custom guidance and clears it when the learner resets', async () => {
    await repository.setSelection({
      presetId: 'mn-preset-everyday',
      registerPreference: 'either',
      customGuidance: 'Casual spoken style; contractions such as ちゃう are natural.',
    });
    const forked = await repository.getSelection();
    expect(forked.ok && forked.value.customGuidance).toContain('ちゃう');

    await repository.setSelection({
      presetId: 'mn-preset-everyday',
      registerPreference: 'either',
    });

    const reset = await repository.getSelection();
    expect(reset.ok && reset.value.customGuidance).toBeUndefined();
  });

  it('captures resolved guidance so revising a preset cannot rewrite history', async () => {
    const capture = {
      id: uuid(8300),
      profileHash: 'profile-hash-1',
      capturedAt: 1_700_700_000_000,
      presetId: 'mn-preset-basic' as const,
      resolvedGuidance: 'Write at roughly JLPT N5 complexity.',
      registerPreference: 'either' as const,
      isCustomGuidance: false,
      structuralBaselineVersion: '1.0.0',
    };

    await repository.captureProfile(capture);
    await repository.setSelection({ presetId: 'mn-preset-literary', registerPreference: 'spoken' });

    const loaded = await repository.getProfileCapture(capture.id);
    expect(loaded.ok && loaded.value?.resolvedGuidance).toBe(
      'Write at roughly JLPT N5 complexity.',
    );
    expect(loaded.ok && loaded.value?.presetId).toBe('mn-preset-basic');
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
    kind: 'anki-connect' as const,
    label: 'Anki · Core Japanese · Expression',
    providerKind: 'desktop-connect' as const,
    deckName: 'Core Japanese',
    deckScope: 'deck-and-subdecks' as const,
    noteTypeName: 'Basic',
    expressionFieldName: 'Expression',
    enabled: true,
    createdAt: 1_700_700_000_000,
    updatedAt: 1_700_700_000_000,
    lastSyncedAt: null,
    automaticSync: true,
  };

  it('stores a mapping with its exact deck scope', async () => {
    await repository.save(mapping);

    const listed = await repository.list();
    expect(listed.ok && listed.value[0]).toMatchObject({ deckScope: 'deck-and-subdecks' });
  });

  it('toggles enablement without losing configuration', async () => {
    await repository.save(mapping);

    const disabled = await repository.setEnabled(mapping.id, false);

    expect(disabled.ok && disabled.value.enabled).toBe(false);
    expect(disabled.ok && disabled.value).toMatchObject({ expressionFieldName: 'Expression' });
  });

  it('reports a missing mapping instead of creating one', async () => {
    const missing = await repository.setEnabled(sourceMappingId(uuid(8499)), false);

    expect(missing.ok).toBe(false);
    if (missing.ok) {
      return;
    }
    expect(missing.error.code).toBe('not-found');
    expect(await db.vocabularySources.count()).toBe(0);
  });

  it('removes a mapping', async () => {
    await repository.save(mapping);
    await repository.remove(mapping.id);

    const listed = await repository.list();
    expect(listed.ok && listed.value).toEqual([]);
  });
});
