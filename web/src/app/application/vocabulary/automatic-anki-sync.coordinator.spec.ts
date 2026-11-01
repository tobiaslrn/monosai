import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTRACT_COLLECTION } from '../../../testing/anki-collection';
import { FakeAnkiProvider } from '../../../testing/anki-fakes';
import { mappingFor } from '../../../testing/anki-provider-contract';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { ankiError } from '../../domain/anki/anki-error';
import type { AnkiVocabularyProvider } from '../../domain/anki/anki-provider';
import { ANKI_PROVIDER_FACTORY } from '../shared/anki-tokens';
import { AutomaticAnkiSyncCoordinator } from './automatic-anki-sync.coordinator';
import { SnapshotHistoryStore } from './snapshot-history.store';
import { unmeasuredBasis } from '../../domain/anki/practice-evidence';
import { vocabularySourceId } from '../../domain/shared/ids';

describe('AutomaticAnkiSyncCoordinator', () => {
  let beds: VocabularyTestBed;
  let coordinator: AutomaticAnkiSyncCoordinator;
  let providerFactory: () => AnkiVocabularyProvider;
  let providerCreations: number;

  beforeEach(() => {
    beds = configureVocabularyTestBed();
    providerCreations = 0;
    providerFactory = () => new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' });
    TestBed.configureTestingModule({
      providers: [
        AutomaticAnkiSyncCoordinator,
        {
          provide: ANKI_PROVIDER_FACTORY,
          useValue: () => {
            providerCreations += 1;
            return providerFactory();
          },
        },
      ],
    });
    coordinator = TestBed.inject(AutomaticAnkiSyncCoordinator);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function configureAutomaticSource(): ReturnType<typeof mappingFor> {
    const source = mappingFor({
      kind: 'anki-connect',
      providerKind: 'desktop-connect',
      automaticSync: true,
    });
    beds.mappings.stored.set(source.id, source);
    return source;
  }

  it('refreshes opted-in Anki sources and commits the combined snapshot', async () => {
    const source = configureAutomaticSource();

    await coordinator.trigger(true);

    expect(coordinator.status().kind).toBe('updated');
    expect(beds.vocabulary.commitCount).toBe(1);
    expect(beds.mappings.caches.get(source.id)?.entries.length).toBeGreaterThan(0);
  });

  it('brings a commit with new words to the active snapshot', async () => {
    configureAutomaticSource();
    const history = TestBed.inject(SnapshotHistoryStore);
    await history.load();
    expect(history.active()).toBeNull();

    await coordinator.trigger(true);

    expect(history.active()?.revision).toBe(coordinator.committedRevision());
  });

  it('leaves the active snapshot alone when a read found the same words', async () => {
    configureAutomaticSource();
    const history = TestBed.inject(SnapshotHistoryStore);
    await coordinator.trigger(true);
    const load = vi.spyOn(history, 'load');
    const before = coordinator.committedRevision();

    // More than once: the store now holds an older revision of the same content.
    await coordinator.trigger(true);
    await coordinator.trigger(true);

    expect(coordinator.committedRevision()).not.toBe(before);
    expect(load).not.toHaveBeenCalled();
  });

  it('catches up with words another tab committed although this read found the same', async () => {
    configureAutomaticSource();
    const history = TestBed.inject(SnapshotHistoryStore);
    await coordinator.trigger(true);
    await coordinator.trigger(true);
    const stored = beds.vocabulary.snapshots[0]!;
    beds.vocabulary.snapshots[0] = { ...stored, revision: 'other-tab' };

    await coordinator.trigger(true);

    expect(coordinator.status().kind).toBe('idle');
    expect(history.active()?.revision).toBe(coordinator.committedRevision());
  });

  it('reloads for a warning that changed while the words stayed the same', async () => {
    const source = configureAutomaticSource();
    const history = TestBed.inject(SnapshotHistoryStore);
    await coordinator.trigger(true);
    expect(history.active()?.stats.sourceWarnings).toEqual([]);
    const unread = {
      ...source,
      id: vocabularySourceId('not-read-yet'),
      label: 'Unread',
      automaticSync: false,
    };
    beds.mappings.stored.set(unread.id, unread);

    await coordinator.trigger(true);

    expect(coordinator.status().kind).toBe('idle');
    expect(history.active()?.stats.sourceWarnings).toEqual(['Unread has not been read yet.']);
  });

  it('marks an update the learner asked for, and only that one', async () => {
    configureAutomaticSource();

    await coordinator.trigger(true, true);
    expect(coordinator.status()).toMatchObject({ kind: 'updated', requested: true });
  });

  it('leaves a background update unmarked', async () => {
    configureAutomaticSource();

    await coordinator.trigger(true);
    expect(coordinator.status()).toMatchObject({ kind: 'updated', requested: false });
  });

  it('hides a successful automatic update after its presentation window', async () => {
    vi.useFakeTimers();
    configureAutomaticSource();

    await coordinator.trigger(true);
    expect(coordinator.status().kind).toBe('updated');

    await vi.advanceTimersByTimeAsync(8_000);

    expect(coordinator.status()).toEqual({ kind: 'idle' });
  });

  it('keeps an unchanged merged vocabulary silent when source records change', async () => {
    configureAutomaticSource();

    await coordinator.trigger(true);

    providerFactory = () =>
      new FakeAnkiProvider(
        {
          ...CONTRACT_COLLECTION,
          notes: CONTRACT_COLLECTION.notes.map((note, index) => ({
            ...note,
            id: `${note.id}-refreshed-${String(index)}`,
          })),
        },
        { kind: 'desktop-connect' },
      );

    await coordinator.trigger(true);

    expect(coordinator.status()).toEqual({ kind: 'idle' });
    expect(beds.vocabulary.commitCount).toBe(2);
  });

  it('reports a banner retry even when no word changed', async () => {
    configureAutomaticSource();
    await coordinator.trigger(true);
    await coordinator.trigger(true);
    // The same read, unflagged, is silent.
    expect(coordinator.status()).toEqual({ kind: 'idle' });
    const commits = beds.vocabulary.commitCount;

    await coordinator.retry();

    expect(beds.vocabulary.commitCount).toBe(commits + 1);
    expect(coordinator.status()).toMatchObject({ kind: 'updated', requested: false });
  });

  it('keeps the report of a retry from leaking into later background reads', async () => {
    configureAutomaticSource();
    await coordinator.trigger(true);
    await coordinator.retry();

    await coordinator.trigger(true);

    expect(coordinator.status()).toEqual({ kind: 'idle' });
  });

  it('reports a retry that joins a background read already running', async () => {
    configureAutomaticSource();
    await coordinator.trigger(true);
    await coordinator.trigger(true);

    const background = coordinator.trigger(true);
    await Promise.all([background, coordinator.retry()]);

    expect(coordinator.status()).toMatchObject({ kind: 'updated', requested: false });
  });

  it('keeps the banner up when a retry meets a transient failure', async () => {
    configureAutomaticSource();
    await coordinator.trigger(true);
    providerFactory = () =>
      new FakeAnkiProvider(CONTRACT_COLLECTION, {
        kind: 'desktop-connect',
        probeError: ankiError('not-running', 'Anki is not running.'),
      });

    await coordinator.retry();

    expect(coordinator.status()).toMatchObject({ kind: 'attention' });
  });

  it('does not carry a failed retry over to the next background read', async () => {
    configureAutomaticSource();
    await coordinator.trigger(true);
    await coordinator.trigger(true);
    providerFactory = () =>
      new FakeAnkiProvider(CONTRACT_COLLECTION, {
        kind: 'desktop-connect',
        probeError: ankiError('not-running', 'Anki is not running.'),
      });
    await coordinator.retry();
    providerFactory = () => new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' });

    await coordinator.trigger(true);

    expect(coordinator.status()).toEqual({ kind: 'idle' });
  });

  it('commits scheduling-only changes without showing an update', async () => {
    const source = configureAutomaticSource();

    await coordinator.trigger(true);
    const before = beds.mappings.caches
      .get(source.id)
      ?.entries.find((entry) => entry.rawValue === '<b>ねこ</b>');

    providerFactory = () =>
      new FakeAnkiProvider(
        {
          ...CONTRACT_COLLECTION,
          notes: CONTRACT_COLLECTION.notes.map((note) => ({
            ...note,
            cards: note.cards.map((card) =>
              card.deckName === 'Core Japanese' && card.reps > 0
                ? { ...card, lapses: (card.lapses ?? 0) + 1, factor: 1_800 }
                : card,
            ),
          })),
        },
        { kind: 'desktop-connect' },
      );

    await coordinator.trigger(true);

    const after = beds.mappings.caches
      .get(source.id)
      ?.entries.find((entry) => entry.rawValue === '<b>ねこ</b>');
    expect(coordinator.status()).toEqual({ kind: 'idle' });
    expect(beds.vocabulary.commitCount).toBe(2);
    expect(after?.lapseRatio).toBeGreaterThan(before?.lapseRatio ?? 0);
    expect(after?.easeFactor).toBe(1_800);
  });

  it('coalesces concurrent triggers and observes the cooldown', async () => {
    configureAutomaticSource();

    await Promise.all([coordinator.trigger(true), coordinator.trigger(true)]);
    await coordinator.trigger();

    expect(providerCreations).toBe(1);
    expect(beds.vocabulary.commitCount).toBe(1);
  });

  describe('coming back from Anki', () => {
    /** Puts the coordinator in the state a hidden tab leaves it in. */
    function goHidden(): void {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    }

    beforeEach(() => {
      coordinator.start();
    });

    it('reads once past the cooldown, because the answers are why they returned', async () => {
      configureAutomaticSource();
      await coordinator.trigger(true);
      expect(beds.vocabulary.commitCount).toBe(1);

      goHidden();
      await coordinator.resume();

      expect(beds.vocabulary.commitCount).toBe(2);
    });

    it('does not read again for every focus event inside one visible session', async () => {
      configureAutomaticSource();
      goHidden();
      await coordinator.resume();
      const afterReturn = beds.vocabulary.commitCount;

      await coordinator.resume();
      await coordinator.trigger();

      expect(beds.vocabulary.commitCount).toBe(afterReturn);
    });

    it('keeps the report of a retry when they return while it runs', async () => {
      configureAutomaticSource();
      await coordinator.trigger(true);
      await coordinator.trigger(true);
      goHidden();

      const retrying = coordinator.retry();
      await Promise.all([retrying, coordinator.resume()]);

      expect(coordinator.status()).toMatchObject({ kind: 'updated', requested: false });

      // Neither read leaves the report behind for the next background one.
      await coordinator.trigger(true);
      expect(coordinator.status()).toEqual({ kind: 'idle' });
    });

    it('queues exactly one follow-up behind a read that began before they returned', async () => {
      configureAutomaticSource();
      const running = coordinator.trigger(true);
      goHidden();

      await Promise.all([running, coordinator.resume(), coordinator.resume()]);

      // The first read cannot contain what was answered while the tab was
      // hidden, so one more happens - and only one, however many events fired.
      expect(beds.vocabulary.commitCount).toBe(2);
    });
  });

  it('publishes a revision for every commit, including a scheduling-only one', async () => {
    configureAutomaticSource();

    await coordinator.trigger(true);
    const first = coordinator.committedRevision();

    providerFactory = () =>
      new FakeAnkiProvider(
        {
          ...CONTRACT_COLLECTION,
          notes: CONTRACT_COLLECTION.notes.map((note) => ({
            ...note,
            cards: note.cards.map((card) =>
              card.reps > 0 ? { ...card, lapses: (card.lapses ?? 0) + 1 } : card,
            ),
          })),
        },
        { kind: 'desktop-connect' },
      );
    await coordinator.trigger(true);

    expect(first).not.toBeNull();
    // The words are identical and the banner stays quiet, but what they prove
    // about recent study is not, and a practice list has to notice.
    expect(coordinator.status()).toEqual({ kind: 'idle' });
    expect(coordinator.committedRevision()).not.toBe(first);
  });

  it('treats unavailable Anki as non-destructive', async () => {
    configureAutomaticSource();
    providerFactory = () =>
      new FakeAnkiProvider(CONTRACT_COLLECTION, {
        kind: 'desktop-connect',
        probeError: ankiError('not-running', 'Anki is not running.'),
      });

    await coordinator.trigger(true);

    expect(coordinator.status()).toMatchObject({ kind: 'waiting' });
    expect(beds.vocabulary.commitCount).toBe(0);
  });

  it('holds an unexpected empty replacement for review', async () => {
    const source = configureAutomaticSource();
    beds.mappings.caches.set(source.id, {
      sourceId: source.id,
      refreshedAt: 1,
      entries: [{ rawValue: '猫' }],
      warnings: [],
      practice: unmeasuredBasis(1),
    });
    const emptyCollection = {
      ...CONTRACT_COLLECTION,
      notes: CONTRACT_COLLECTION.notes.map((note) => ({
        ...note,
        cards: note.cards.map((card) => ({ ...card, reps: 0 })),
      })),
    };
    providerFactory = () => new FakeAnkiProvider(emptyCollection, { kind: 'desktop-connect' });

    await coordinator.trigger(true);

    expect(coordinator.status()).toMatchObject({ kind: 'attention' });
    expect(beds.vocabulary.commitCount).toBe(0);
    expect(beds.mappings.caches.get(source.id)?.entries).toEqual([{ rawValue: '猫' }]);
  });
});
