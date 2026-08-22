import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import { snapshotId, vocabularyItemId } from '../../../domain/shared/ids';
import { createTestDatabase, destroyTestDatabase } from '../../../../testing/test-database';
import {
  generatedStoryFixture,
  snapshotFixture,
  uuid,
} from '../../../../testing/persistence-fixtures';
import type { MonosaiDatabase } from '../monosai-db';
import { ROW_VERSION } from '../schemas/common.schema';
import { DexieSettingsRepository } from './dexie-settings.repository';
import { DexieVocabularyRepository } from './dexie-vocabulary.repository';

describe('DexieVocabularyRepository', () => {
  let db: MonosaiDatabase;
  let repository: DexieVocabularyRepository;
  let settings: DexieSettingsRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repository = new DexieVocabularyRepository(db);
    settings = new DexieSettingsRepository(db, fixedClock(1_700_400_000_000));
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  it('commits snapshot, items, and provenance, then activates the snapshot', async () => {
    const commit = snapshotFixture(1);

    const committed = await repository.commitSnapshot(commit);

    expect(committed.ok).toBe(true);
    expect(await db.vocabularyItems.count()).toBe(commit.items.length);
    expect(await db.vocabularyProvenance.count()).toBe(commit.provenance.length);

    const active = await repository.getActiveSnapshot();
    expect(active.ok && active.value?.id).toBe(commit.snapshot.id);
  });

  it('leaves the active snapshot unchanged when a commit fails', async () => {
    const first = snapshotFixture(2);
    await repository.commitSnapshot(first);

    const broken = snapshotFixture(3);
    const failed = await repository.commitSnapshot({
      ...broken,
      snapshot: { ...broken.snapshot, uniqueEntryCount: broken.items.length + 4 },
    });

    expect(failed.ok).toBe(false);
    const active = await repository.getActiveSnapshot();
    expect(active.ok && active.value?.id).toBe(first.snapshot.id);
    expect(await db.vocabularySnapshots.count()).toBe(1);
  });

  it('rejects provenance that points outside the committed snapshot', async () => {
    const commit = snapshotFixture(4);

    const failed = await repository.commitSnapshot({
      ...commit,
      provenance: [
        {
          ...commit.provenance[0],
          vocabularyItemId: vocabularyItemId(uuid(31337)),
        },
      ],
    });

    expect(failed.ok).toBe(false);
    expect(await db.vocabularySnapshots.count()).toBe(0);
    expect(await db.vocabularyProvenance.count()).toBe(0);
  });

  it('rejects duplicate item identities', async () => {
    const commit = snapshotFixture(5);

    const failed = await repository.commitSnapshot({
      ...commit,
      items: [commit.items[0], { ...commit.items[1], id: commit.items[0].id }],
      snapshot: { ...commit.snapshot, uniqueEntryCount: 2 },
      provenance: [],
    });

    expect(failed.ok).toBe(false);
    expect(await db.vocabularyItems.count()).toBe(0);
  });

  it('replaces the current snapshot and keeps one persisted row', async () => {
    const older = snapshotFixture(6);
    const newer = snapshotFixture(7, 2);
    await repository.commitSnapshot(older);
    const replaced = await repository.commitSnapshot({
      ...newer,
      snapshot: { ...newer.snapshot, createdAt: older.snapshot.createdAt + 5000 },
    });

    const snapshots = await repository.listSnapshots();

    expect(snapshots.ok).toBe(true);
    expect(replaced.ok).toBe(true);
    if (!snapshots.ok) {
      return;
    }
    expect(snapshots.value).toHaveLength(1);
    expect(snapshots.value[0].id).toBe(older.snapshot.id);
    expect(snapshots.value[0].createdAt).toBe(older.snapshot.createdAt + 5000);
    expect(await db.vocabularyItems.count()).toBe(newer.items.length);
    const items = await db.vocabularyItems.toArray();
    expect(items.every((item) => item.snapshotId === older.snapshot.id)).toBe(true);
  });

  it('keeps generated stories linked to the stable current identity', async () => {
    const first = snapshotFixture(13);
    await repository.commitSnapshot(first);
    const story = generatedStoryFixture(14, first.snapshot.id);
    await db.readings.add({ ...story, v: ROW_VERSION });

    await repository.commitSnapshot(snapshotFixture(15, 2));

    const stored = await db.readings.get(story.id);
    expect(stored?.kind).toBe('generated');
    if (stored?.kind !== 'generated') {
      return;
    }
    expect(stored.snapshotId).toBe(first.snapshot.id);
    const count = await repository.countStoriesUsingSnapshot(first.snapshot.id);
    expect(count.ok && count.value).toBe(1);
  });

  it('streams matcher input in bounded batches', async () => {
    const commit = snapshotFixture(8, 5);
    await repository.commitSnapshot(commit);

    const batches: number[] = [];
    for await (const batch of repository.streamItems(commit.snapshot.id, 2)) {
      batches.push(batch.length);
    }

    expect(batches).toEqual([2, 2, 1]);
  });

  it('retains provenance for deduplicated expressions', async () => {
    const commit = snapshotFixture(9, 2);
    const extraProvenance = {
      ...commit.provenance[0],
      sourceMappingId: uuid(4711),
      deckName: 'Second deck',
    };
    await repository.commitSnapshot({
      ...commit,
      provenance: [...commit.provenance, extraProvenance],
    });

    const provenance = await repository.listProvenance(commit.snapshot.id);

    expect(provenance.ok).toBe(true);
    if (!provenance.ok) {
      return;
    }
    const forFirstItem = provenance.value.filter(
      (record) => record.vocabularyItemId === commit.items[0].id,
    );
    expect(forFirstItem).toHaveLength(2);
    expect(forFirstItem.map((record) => record.deckName)).toContain('Second deck');
  });

  it('counts generated stories that reference a snapshot', async () => {
    const commit = snapshotFixture(10);
    await repository.commitSnapshot(commit);
    await db.readings.add({ ...generatedStoryFixture(11, commit.snapshot.id), v: ROW_VERSION });

    const count = await repository.countStoriesUsingSnapshot(commit.snapshot.id);
    expect(count.ok && count.value).toBe(1);

    const other = await repository.countStoriesUsingSnapshot(snapshotId(uuid(881)));
    expect(other.ok && other.value).toBe(0);
  });

  it('has no active snapshot on a fresh install', async () => {
    const active = await repository.getActiveSnapshot();
    expect(active.ok && active.value).toBeNull();
  });

  it('preserves unrelated app settings when activating a snapshot', async () => {
    await settings.updateAppSettings({ theme: 'dark' });
    const commit = snapshotFixture(12);

    await repository.commitSnapshot(commit);

    const app = await settings.getAppSettings();
    expect(app.ok && app.value.theme).toBe('dark');
    expect(app.ok && app.value.activeSnapshotId).toBe(commit.snapshot.id);
  });
});
