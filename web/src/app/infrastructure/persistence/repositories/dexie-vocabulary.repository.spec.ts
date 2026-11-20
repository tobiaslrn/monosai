import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../../domain/shared/clock';
import {
  snapshotId,
  vocabularyItemId,
  vocabularySourceId,
  type VocabularySourceId,
} from '../../../domain/shared/ids';
import type { VocabularySource } from '../../../domain/vocabulary/vocabulary-source';
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
import { unmeasuredBasis } from '../../../domain/anki/practice-evidence';

function packageSourceFixture(id: VocabularySourceId): VocabularySource {
  return {
    id,
    kind: 'anki-package',
    label: 'Anki · Core Japanese · Expression',
    providerKind: 'package',
    deckName: 'Core Japanese',
    deckScope: 'deck-and-subdecks',
    noteTypeName: 'Basic',
    expressionFieldName: 'Expression',
    enabled: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastSyncedAt: 1_700_000_000_000,
    automaticSync: false,
  };
}

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

  it('reloads the practice evidence a refresh established, word by word', async () => {
    const commit = snapshotFixture(40);
    const sourceId = commit.provenance[0]!.sourceId;
    const practised = {
      ...commit.items[0]!,
      practice: { answeredWithinDays: 1, answeredAgain: true },
    } as const;
    const observed = {
      recentAnswers: 'available',
      recentDifficulty: 'available',
      learningState: 'available',
      fsrsDifficulty: 'unsupported',
      windowBasis: 'anki-study-days',
      observedAt: 1_700_000_000_000,
    } as const;

    await repository.commitSnapshot({
      ...commit,
      items: [practised, ...commit.items.slice(1)],
      sources: [packageSourceFixture(sourceId)],
      caches: [
        {
          sourceId,
          refreshedAt: 1_700_000_000_000,
          entries: [{ rawValue: '猫', practice: { answeredWithinDays: 1 } }],
          warnings: [],
          practice: observed,
        },
      ],
    });
    db.close();
    await db.open();

    const loaded = await repository.loadItems(commit.snapshot.id);
    const reloaded: unknown[] = loaded.ok ? [...(loaded.value?.items ?? [])] : [];
    expect(reloaded).toContainEqual(expect.objectContaining({ practice: practised.practice }));
    // The basis has to survive with the words, or a reload could not tell a word
    // nobody practised from one this source was never able to speak about.
    expect((await db.vocabularySourceCaches.get(sourceId))?.practice).toEqual(observed);
    // A word with no evidence carries no key at all, rather than an empty shape.
    expect(reloaded.filter((item) => 'practice' in (item as object))).toHaveLength(1);
  });

  it('reloads Android first-review day precision with the timestamp', async () => {
    const commit = snapshotFixture(53);
    const first = {
      ...commit.items[0]!,
      firstReviewedAt: 1_700_000_000_000,
      firstReviewedPrecision: 'anki-day' as const,
    };
    await repository.commitSnapshot({
      ...commit,
      items: [first, ...commit.items.slice(1)],
    });

    const loaded = await repository.loadItems(commit.snapshot.id);
    const reloaded: unknown[] = loaded.ok ? [...(loaded.value?.items ?? [])] : [];

    expect(reloaded).toContainEqual(expect.objectContaining(first));
  });

  it('captures the vocabulary, its revision, and what its sources proved together', async () => {
    const commit = snapshotFixture(41);
    const sourceId = commit.provenance[0]!.sourceId;
    const observed = {
      recentAnswers: 'available',
      recentDifficulty: 'available',
      learningState: 'available',
      fsrsDifficulty: 'unavailable',
      windowBasis: 'anki-study-days',
      observedAt: 1_700_000_000_000,
    } as const;
    await repository.commitSnapshot({
      ...commit,
      items: [
        { ...commit.items[0]!, practice: { answeredWithinDays: 1 }, fsrsDifficulty: 8 },
        ...commit.items.slice(1),
      ],
      sources: [packageSourceFixture(sourceId)],
      caches: [
        {
          sourceId,
          refreshedAt: 1_700_000_000_000,
          entries: [],
          warnings: ['Difficulty was unavailable.'],
          practice: observed,
        },
      ],
    });

    const captured = await repository.captureVocabulary();

    expect(captured.ok).toBe(true);
    if (!captured.ok || captured.value === null) {
      throw new Error('expected a capture');
    }
    expect(captured.value.snapshot.revision).toBe(commit.snapshot.revision);
    expect(captured.value.expressions).toHaveLength(commit.items.length);
    expect(captured.value.expressions).toContainEqual(
      expect.objectContaining({
        canonicalExpression: commit.items[0]!.canonicalExpression,
        itemIds: [commit.items[0]!.id],
        practice: { answeredWithinDays: 1 },
        fsrsDifficulty: 8,
      }),
    );
    // A word no source spoke about carries no evidence key, so an absence
    // cannot be read back as a proven "not practised".
    expect(
      captured.value.expressions.filter((expression) => 'practice' in expression),
    ).toHaveLength(1);
    expect(captured.value.sources).toEqual([
      expect.objectContaining({
        sourceId,
        label: 'Anki · Core Japanese · Expression',
        refreshedAt: 1_700_000_000_000,
        practice: observed,
        warnings: ['Difficulty was unavailable.'],
      }),
    ]);
  });

  it('says a source was never read rather than inventing an observation for it', async () => {
    const commit = snapshotFixture(42);
    const sourceId = commit.provenance[0]!.sourceId;
    await repository.commitSnapshot({ ...commit, sources: [packageSourceFixture(sourceId)] });

    const captured = await repository.captureVocabulary();

    expect(captured.ok && captured.value?.sources).toEqual([
      expect.objectContaining({ sourceId, refreshedAt: null, practice: null }),
    ]);
  });

  it('leaves an excluded source out of the capture that explains the words', async () => {
    const commit = snapshotFixture(43);
    const sourceId = commit.provenance[0]!.sourceId;
    await repository.commitSnapshot({
      ...commit,
      sources: [{ ...packageSourceFixture(sourceId), enabled: false }],
    });

    const captured = await repository.captureVocabulary();

    expect(captured.ok && captured.value?.sources).toEqual([]);
  });

  it('captures nothing at all before a first vocabulary exists', async () => {
    const captured = await repository.captureVocabulary();

    expect(captured.ok && captured.value).toBeNull();
  });

  it('lists browser entries with readings, dates, meanings, and provenance at one revision', async () => {
    const commit = snapshotFixture(52);
    const sourceId = commit.provenance[0]!.sourceId;
    const first = commit.items[0]!;
    await repository.commitSnapshot({
      ...commit,
      items: [
        {
          ...first,
          meaning: 'cat',
          firstReviewedAt: 1_700_000_000_000,
          firstReviewedPrecision: 'anki-day',
          lastReviewedAt: 1_700_100_000_000,
          fsrsDifficulty: 5.5,
          analyzedSequence: [{ surface: 'ねこ', readingHiragana: 'ねこ' }],
        },
        ...commit.items.slice(1),
      ],
      sources: [packageSourceFixture(sourceId)],
    });

    const listed = await repository.listVocabularyEntries();

    expect(listed.ok).toBe(true);
    if (!listed.ok || listed.value === null) {
      throw new Error('expected browser vocabulary');
    }
    expect(listed.value.snapshot.revision).toBe(commit.snapshot.revision);
    const listedEntry = listed.value.entries.find((entry) => entry.itemId === first.id);
    expect(listedEntry).toMatchObject({
      itemId: first.id,
      visibleExpression: 'ねこ',
      readingHiragana: 'ねこ',
      meaning: 'cat',
      fsrsDifficulty: 5.5,
      firstReviewedAt: 1_700_000_000_000,
      firstReviewedPrecision: 'anki-day',
      lastReviewedAt: 1_700_100_000_000,
      sourceIds: [sourceId],
    });
    expect(listed.value.sources).toEqual([
      expect.objectContaining({ sourceId, label: 'Anki · Core Japanese · Expression' }),
    ]);
  });

  it('lists no browser vocabulary before a first snapshot exists', async () => {
    const listed = await repository.listVocabularyEntries();

    expect(listed.ok && listed.value).toBeNull();
  });

  it('gives every committed replacement its own revision', async () => {
    const first = snapshotFixture(44);
    await repository.commitSnapshot(first);
    const second = { ...snapshotFixture(45), expectedRevision: first.snapshot.revision };

    const committed = await repository.commitSnapshot(second);

    expect(committed.ok && committed.value.revision).toBe(second.snapshot.revision);
    expect(committed.ok && committed.value.revision).not.toBe(first.snapshot.revision);
    // The id is reused so generated stories keep one link; the revision is what
    // tells a capture that the words behind that link have been replaced.
    expect(committed.ok && committed.value.id).toBe(first.snapshot.id);
  });

  it('refuses a build prepared against a vocabulary that has since been replaced', async () => {
    const first = snapshotFixture(46);
    await repository.commitSnapshot(first);
    const newer = { ...snapshotFixture(47), expectedRevision: first.snapshot.revision };
    await repository.commitSnapshot(newer);

    const stale = snapshotFixture(48);
    const refused = await repository.commitSnapshot({
      ...stale,
      expectedRevision: first.snapshot.revision,
    });

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.code).toBe('conflict');
    // The newer commit survives untouched: refusing is the point of the guard.
    const active = await repository.getActiveSnapshot();
    expect(active.ok && active.value?.revision).toBe(newer.snapshot.revision);
  });

  it('refuses a first build when another first build was committed meanwhile', async () => {
    // Both builds were prepared on a fresh install, so neither read a revision.
    const fromThisTab = snapshotFixture(61);
    const fromAnotherTab = snapshotFixture(62, 2);
    await repository.commitSnapshot({ ...fromAnotherTab, expectedRevision: null });

    const refused = await repository.commitSnapshot({ ...fromThisTab, expectedRevision: null });

    expect(!refused.ok && refused.error.code).toBe('conflict');
    expect(await db.vocabularyItems.count()).toBe(fromAnotherTab.items.length);
  });

  it('accepts a build prepared against the revision that is actually stored', async () => {
    const first = snapshotFixture(49);
    await repository.commitSnapshot(first);
    const next = snapshotFixture(50);

    const committed = await repository.commitSnapshot({
      ...next,
      expectedRevision: first.snapshot.revision,
    });

    expect(committed.ok).toBe(true);
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

  it('stores the sources and caches the snapshot was built from', async () => {
    const commit = snapshotFixture(20);
    const sourceId = commit.provenance[0]!.sourceId;

    const committed = await repository.commitSnapshot({
      ...commit,
      sources: [packageSourceFixture(sourceId)],
      caches: [
        {
          sourceId,
          refreshedAt: 1_700_000_000_000,
          entries: [{ rawValue: '猫' }],
          warnings: [],
          practice: unmeasuredBasis(1_700_000_000_000),
        },
      ],
    });

    expect(committed.ok).toBe(true);
    expect(await db.vocabularySources.get(sourceId)).toMatchObject({ deckName: 'Core Japanese' });
    expect(await db.vocabularySourceCaches.get(sourceId)).toMatchObject({
      refreshedAt: 1_700_000_000_000,
    });
  });

  it('stores neither source nor cache when the commit is rejected', async () => {
    const commit = snapshotFixture(21);
    const sourceId = commit.provenance[0]!.sourceId;

    const failed = await repository.commitSnapshot({
      ...commit,
      snapshot: { ...commit.snapshot, uniqueEntryCount: commit.items.length + 1 },
      sources: [packageSourceFixture(sourceId)],
      caches: [
        { sourceId, refreshedAt: 1, entries: [], warnings: [], practice: unmeasuredBasis(1) },
      ],
    });

    expect(failed.ok).toBe(false);
    expect(await db.vocabularySources.count()).toBe(0);
    expect(await db.vocabularySourceCaches.count()).toBe(0);
  });

  it('rejects a commit whose source cannot be stored, before writing anything', async () => {
    const commit = snapshotFixture(22);
    const sourceId = commit.provenance[0]!.sourceId;

    const failed = await repository.commitSnapshot({
      ...commit,
      sources: [{ ...packageSourceFixture(sourceId), deckName: 42 } as unknown as VocabularySource],
      caches: [],
    });

    expect(failed.ok).toBe(false);
    expect(await db.vocabularySnapshots.count()).toBe(0);
    expect(await db.vocabularySources.count()).toBe(0);
  });

  it('rejects provenance that points outside the committed snapshot', async () => {
    const commit = snapshotFixture(4);

    const failed = await repository.commitSnapshot({
      ...commit,
      provenance: [
        {
          ...commit.provenance[0]!,
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
      items: [commit.items[0]!, { ...commit.items[1]!, id: commit.items[0]!.id }],
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
      expectedRevision: older.snapshot.revision,
    });

    const snapshots = await repository.listSnapshots();

    expect(snapshots.ok).toBe(true);
    expect(replaced.ok).toBe(true);
    if (!snapshots.ok) {
      return;
    }
    expect(snapshots.value).toHaveLength(1);
    expect(snapshots.value[0]!.id).toBe(older.snapshot.id);
    expect(snapshots.value[0]!.createdAt).toBe(older.snapshot.createdAt + 5000);
    expect(await db.vocabularyItems.count()).toBe(newer.items.length);
    const items = await db.vocabularyItems.toArray();
    expect(items.every((item) => item.snapshotId === older.snapshot.id)).toBe(true);
  });

  it('lists expression hashes for the active snapshot', async () => {
    const commit = snapshotFixture(16, 2);
    await repository.commitSnapshot(commit);

    const hashes = await repository.listExpressionHashes(commit.snapshot.id);

    expect(hashes).toEqual({
      ok: true,
      value: commit.items.map((item) => item.expressionHash),
    });
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

  it('loads matcher input with the revision it belongs to', async () => {
    const commit = snapshotFixture(8, 5);
    await repository.commitSnapshot(commit);

    const loaded = await repository.loadItems(commit.snapshot.id);

    expect(loaded.ok && loaded.value?.revision).toBe(commit.snapshot.revision);
    expect(loaded.ok && loaded.value?.items).toHaveLength(5);
  });

  it('retains provenance for deduplicated expressions', async () => {
    const commit = snapshotFixture(9, 2);
    const extraProvenance = {
      ...commit.provenance[0]!,
      sourceId: vocabularySourceId(uuid(4711)),
      sourceLabel: 'Second deck',
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
      (record) => record.vocabularyItemId === commit.items[0]!.id,
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

  describe('matcher input', () => {
    it('loads one consistent vocabulary when a commit lands during the read', async () => {
      const first = snapshotFixture(1, 4);
      await repository.commitSnapshot(first);
      const replacement = { ...snapshotFixture(2, 5), expectedRevision: first.snapshot.revision };

      // Another tab, or this tab's automatic sync, commits meanwhile.
      const [loaded] = await Promise.all([
        repository.loadItems(first.snapshot.id),
        repository.commitSnapshot(replacement),
      ]);

      if (!loaded.ok || loaded.value === null) throw new Error('the items should load');
      const streamed = loaded.value.items.map((item) => item.id).sort();
      const before = first.items.map((item) => item.id).sort();
      const after = replacement.items.map((item) => item.id).sort();
      expect([before, after]).toContainEqual(streamed);
    });

    it('refuses a stored item that is not a vocabulary item', async () => {
      const commit = snapshotFixture(1, 2);
      await repository.commitSnapshot(commit);
      await db.vocabularyItems.put({
        id: uuid(1999),
        snapshotId: commit.snapshot.id,
        v: ROW_VERSION,
      } as never);

      const loaded = await repository.loadItems(commit.snapshot.id);

      expect(!loaded.ok && loaded.error.code).toBe('corrupt-record');
    });

    it('reports a vocabulary that is no longer stored', async () => {
      const loaded = await repository.loadItems(snapshotFixture(1, 2).snapshot.id);

      expect(loaded.ok && loaded.value).toBeNull();
    });
  });
});
