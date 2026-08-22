import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sourceMappingId } from '../../../domain/shared/ids';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import type { MonosaiDatabase } from '../monosai-db';
import { ROW_VERSION } from '../schemas/common.schema';
import { DexieSourceMappingRepository } from './dexie-source-mapping.repository';

const FIRST = sourceMappingId('11111111-1111-4111-8111-111111111111');
const SECOND = sourceMappingId('22222222-2222-4222-8222-222222222222');

function mapping(overrides: Partial<SourceMapping> = {}): SourceMapping {
  return {
    id: FIRST,
    kind: 'anki-connect',
    label: 'Anki · Core Japanese · Expression',
    providerKind: 'desktop-connect',
    deckName: 'Core Japanese',
    deckScope: 'deck-only',
    noteTypeName: 'Basic',
    expressionFieldName: 'Expression',
    enabled: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastSyncedAt: null,
    automaticSync: true,
    ...overrides,
  };
}

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

  it('starts empty', async () => {
    const listed = await repository.list();
    expect(listed).toEqual({ ok: true, value: [] });
  });

  it('saves and lists a mapping without its row envelope', async () => {
    const saved = await repository.save(mapping());
    expect(saved.ok).toBe(true);

    const listed = await repository.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toEqual([mapping()]);
    expect(listed.value[0]).not.toHaveProperty('v');
  });

  it('stores the current row version', async () => {
    await repository.save(mapping());
    const row = await db.vocabularySources.get(FIRST);
    expect(row?.v).toBe(ROW_VERSION);
  });

  it('replaces a mapping saved under the same id', async () => {
    await repository.save(mapping());
    await repository.save(mapping({ expressionFieldName: 'Word', updatedAt: 1_700_000_001_000 }));

    const listed = await repository.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(1);
    expect(listed.value[0]).toMatchObject({ expressionFieldName: 'Word' });
  });

  it('keeps mappings that differ only by note type side by side', async () => {
    await repository.save(mapping());
    await repository.save(mapping({ id: SECOND, noteTypeName: 'Sentence' }));

    const listed = await repository.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(2);
  });

  it('toggles enablement and returns the stored mapping', async () => {
    await repository.save(mapping());

    const disabled = await repository.setEnabled(FIRST, false);
    expect(disabled.ok).toBe(true);
    if (!disabled.ok) return;
    expect(disabled.value.enabled).toBe(false);

    const listed = await repository.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value[0].enabled).toBe(false);
  });

  it('reports a missing mapping rather than creating one', async () => {
    const toggled = await repository.setEnabled(FIRST, false);
    expect(toggled.ok).toBe(false);
    if (toggled.ok) return;
    expect(toggled.error.code).toBe('not-found');
    expect(await db.vocabularySources.count()).toBe(0);
  });

  it('removes a mapping and leaves the others alone', async () => {
    await repository.save(mapping());
    await repository.save(mapping({ id: SECOND, noteTypeName: 'Sentence' }));

    const removed = await repository.remove(FIRST);
    expect(removed.ok).toBe(true);

    const listed = await repository.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((row) => row.id)).toEqual([SECOND]);
  });

  it('treats removing an unknown mapping as a no-op', async () => {
    const removed = await repository.remove(SECOND);
    expect(removed.ok).toBe(true);
  });

  it('reports a corrupt row rather than returning it', async () => {
    await db.vocabularySources.put({
      ...mapping(),
      v: ROW_VERSION,
      deckScope: 'deck-and-everything',
    } as never);

    const listed = await repository.list();
    expect(listed.ok).toBe(false);
    if (listed.ok) return;
    expect(listed.error.code).toBe('corrupt-record');
  });

  it('persists pasted-list sources without Anki-shaped placeholder fields', async () => {
    const source = {
      id: SECOND,
      kind: 'text-list' as const,
      label: 'My list',
      content: '猫\n食べる',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
      lastSyncedAt: 1,
    };

    await repository.save(source);
    const listed = await repository.list();

    expect(listed.ok && listed.value).toContainEqual(source);
    expect(listed.ok && listed.value[0]).not.toHaveProperty('deckName');
  });

  it('stores complete source caches and deletes them with their source', async () => {
    await repository.save(mapping());
    await repository.replaceCaches([
      {
        sourceId: FIRST,
        refreshedAt: 10,
        entries: [{ rawValue: '猫', sourceRecordId: '1' }],
        warnings: [],
      },
    ]);

    expect(await repository.readCaches([FIRST])).toEqual({
      ok: true,
      value: [
        {
          sourceId: FIRST,
          refreshedAt: 10,
          entries: [{ rawValue: '猫', sourceRecordId: '1' }],
          warnings: [],
        },
      ],
    });

    await repository.remove(FIRST);
    expect(await repository.readCaches([FIRST])).toEqual({ ok: true, value: [] });
  });
});
