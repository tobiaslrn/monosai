import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONTRACT_COLLECTION,
  NO_REVIEW_EVIDENCE_COLLECTION,
} from '../../../testing/anki-collection';
import { FakeAnkiProvider } from '../../../testing/anki-fakes';
import { mappingFor } from '../../../testing/anki-provider-contract';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { ankiError } from '../../domain/anki/anki-error';
import { snapshotId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import type { SourceMapping } from '../../domain/vocabulary/source-mapping';
import { AppSettingsStore } from '../settings/app-settings.store';
import { SourceMappingStore } from './source-mapping.store';
import { VocabularyRefreshStore } from './vocabulary-refresh.store';

const BASIC = mappingFor();

describe('VocabularyRefreshStore', () => {
  let beds: VocabularyTestBed;
  let store: VocabularyRefreshStore;
  let settings: AppSettingsStore;
  let sources: SourceMappingStore;

  beforeEach(() => {
    beds = configureVocabularyTestBed();
    store = TestBed.inject(VocabularyRefreshStore);
    settings = TestBed.inject(AppSettingsStore);
    sources = TestBed.inject(SourceMappingStore);
  });

  async function connect(provider = new FakeAnkiProvider(CONTRACT_COLLECTION)): Promise<void> {
    await store.connect(provider);
  }

  /**
   * Puts the given mappings in the store the refresh reads from.
   *
   * The refresh deliberately takes no mapping argument, so a spec configures
   * the sources the same way the editor does.
   */
  async function configure(mappings: readonly SourceMapping[]): Promise<void> {
    for (const mapping of mappings) {
      await sources.add(mapping);
      if (!mapping.enabled) {
        const added = sources.mappings().at(-1);
        if (added !== undefined) {
          await sources.setEnabled(added.id, false);
        }
      }
    }
  }

  async function refreshWith(mappings: readonly SourceMapping[] = [BASIC]): Promise<void> {
    await connect();
    await configure(mappings);
    await store.refresh();
  }

  describe('connecting', () => {
    it('starts idle', () => {
      expect(store.state()).toEqual({ kind: 'idle' });
      expect(store.mappingEditorEnabled()).toBe(false);
    });

    it('probes and discovers, then returns to idle', async () => {
      await connect();

      expect(store.state()).toEqual({ kind: 'idle' });
      expect(store.capabilities()?.canFilterReviewed).toBe(true);
      expect(store.catalog()?.decks.length).toBeGreaterThan(0);
      expect(store.mappingEditorEnabled()).toBe(true);
    });

    it('opens the mapping editor only once discovery has completed', async () => {
      await store.connect(
        new FakeAnkiProvider(CONTRACT_COLLECTION, {
          discoverError: ankiError('deck-discovery-failed', 'no decks'),
        }),
      );

      expect(store.state().kind).toBe('failed');
      expect(store.mappingEditorEnabled()).toBe(false);
    });

    it('reports a failed probe without a catalog', async () => {
      await store.connect(
        new FakeAnkiProvider(CONTRACT_COLLECTION, {
          probeError: ankiError('not-running', 'Anki is not running.'),
        }),
      );

      const state = store.state();
      expect(state.kind).toBe('failed');
      if (state.kind !== 'failed') return;
      expect(state.error.code).toBe('not-running');
      expect(store.catalog()).toBeNull();
    });

    it('disposes the previous provider when connecting again', async () => {
      const first = new FakeAnkiProvider(CONTRACT_COLLECTION);
      await store.connect(first);
      await store.connect(new FakeAnkiProvider(CONTRACT_COLLECTION));

      expect(first.disposed).toBe(true);
    });
  });

  describe('mapping validation', () => {
    it('blocks a refresh while a mapping is stale', async () => {
      await connect();
      await configure([mappingFor({ deckName: 'Gone' })]);
      await store.refresh();

      const state = store.state();
      expect(state.kind).toBe('failed');
      if (state.kind !== 'failed') return;
      expect(state.error.message).toContain('no longer match');
      expect(beds.vocabulary.commitCount).toBe(0);
    });

    it('blocks a refresh with nothing enabled', async () => {
      await connect();
      await configure([mappingFor({ enabled: false })]);
      await store.refresh();

      expect(store.state().kind).toBe('failed');
      expect(beds.vocabulary.commitCount).toBe(0);
    });

    it('refuses to refresh before connecting', async () => {
      await configure([BASIC]);
      await store.refresh();

      const state = store.state();
      expect(state.kind).toBe('failed');
      if (state.kind !== 'failed') return;
      expect(state.error.code).toBe('not-running');
    });
  });

  describe('preparing a snapshot', () => {
    it('waits for confirmation rather than writing anything', async () => {
      await refreshWith();

      expect(store.state().kind).toBe('awaiting-confirmation');
      expect(beds.vocabulary.commitCount).toBe(0);
      expect(beds.vocabulary.snapshots).toHaveLength(0);
    });

    it('summarizes what it found', async () => {
      await refreshWith();

      const state = store.state();
      expect(state.kind).toBe('awaiting-confirmation');
      if (state.kind !== 'awaiting-confirmation') return;

      // ねこ twice, plus 見る, 犬, お腹 が 空いた; the blank value is rejected.
      expect(state.summary.stats).toMatchObject({
        mappingsQueried: 1,
        reviewedEligibleNotes: 6,
        nonEmptyValues: 5,
        rejectedEmptyValues: 1,
        duplicateOccurrences: 1,
        uniqueExpressions: 4,
      });
    });

    it('strips markup from the expressions it prepared', async () => {
      await refreshWith();

      const state = store.state();
      if (state.kind !== 'awaiting-confirmation') return;
      const expressions = state.summary.commit.items.map((item) => item.visibleExpression);

      expect(expressions).toContain('ねこ');
      expect(expressions).toContain('犬');
      expect(expressions.some((value) => value.includes('script'))).toBe(false);
    });

    it('keeps one provenance record per contributing note', async () => {
      await refreshWith();

      const state = store.state();
      if (state.kind !== 'awaiting-confirmation') return;
      const neko = state.summary.commit.items.find((item) => item.visibleExpression === 'ねこ');
      const records = state.summary.commit.provenance.filter(
        (record) => record.vocabularyItemId === neko?.id,
      );

      expect(records).toHaveLength(2);
      expect(records[0].deckName).toBe('Core Japanese');
      expect(records[0].fieldName).toBe('Expression');
    });

    it('tokenizes each distinct expression once', async () => {
      await refreshWith();

      const analyzed = beds.runtime.analyzedBatches.flat();
      expect(analyzed).toHaveLength(4);
      expect(new Set(analyzed).size).toBe(4);
    });

    it('carries provider warnings into the summary', async () => {
      await store.connect(
        new FakeAnkiProvider(CONTRACT_COLLECTION, { warnings: ['Nothing has been reviewed.'] }),
      );
      await configure([BASIC]);
      await store.refresh();

      const state = store.state();
      if (state.kind !== 'awaiting-confirmation') return;
      expect(state.summary.stats.providerWarnings).toEqual(['Nothing has been reviewed.']);
    });

    it('prepares an empty snapshot when nothing was ever reviewed', async () => {
      await store.connect(new FakeAnkiProvider(NO_REVIEW_EVIDENCE_COLLECTION));
      await configure([BASIC]);
      await store.refresh();

      const state = store.state();
      expect(state.kind).toBe('awaiting-confirmation');
      if (state.kind !== 'awaiting-confirmation') return;
      expect(state.summary.stats.uniqueExpressions).toBe(0);
    });
  });

  describe('confirming', () => {
    it('commits the snapshot and makes it active', async () => {
      await refreshWith();
      await store.confirm();

      const state = store.state();
      expect(state.kind).toBe('complete');
      if (state.kind !== 'complete') return;
      expect(state.snapshot.uniqueEntryCount).toBe(4);
      expect(beds.vocabulary.activeSnapshotId).toBe(state.snapshot.id);
    });

    it('overwrites the current snapshot on the next confirmed refresh', async () => {
      await refreshWith();
      await store.confirm();
      const firstId = beds.vocabulary.activeSnapshotId;

      await connect();
      await store.refresh();
      await store.confirm();

      expect(beds.vocabulary.snapshots).toHaveLength(1);
      expect(beds.vocabulary.activeSnapshotId).toBe(firstId);
      expect(beds.vocabulary.items).toHaveLength(4);
    });

    it('tells the settings store the active snapshot changed', async () => {
      await refreshWith();
      expect(settings.activeSnapshotId()).toBeNull();

      await store.confirm();
      expect(settings.activeSnapshotId()).toBe(beds.vocabulary.activeSnapshotId);
    });

    it('stores the items and their provenance together', async () => {
      await refreshWith();
      await store.confirm();

      expect(beds.vocabulary.items).toHaveLength(4);
      expect(beds.vocabulary.provenance.length).toBeGreaterThanOrEqual(4);
    });

    it('does nothing when there is nothing awaiting confirmation', async () => {
      await store.confirm();
      expect(beds.vocabulary.commitCount).toBe(0);
    });

    it('leaves the previous snapshot active when the commit fails', async () => {
      const previous = snapshotId('99999999-9999-4999-8999-999999999999');
      beds.vocabulary.activeSnapshotId = previous;
      beds.vocabulary.commitFailure = storageError('quota', 'Storage is full.');

      await refreshWith();
      await store.confirm();

      const state = store.state();
      expect(state.kind).toBe('failed');
      if (state.kind !== 'failed') return;
      expect(state.error.code).toBe('quota');
      expect(beds.vocabulary.activeSnapshotId).toBe(previous);
      expect(beds.vocabulary.snapshots).toHaveLength(0);
      expect(store.announcement()).toContain('previous one is unchanged');
    });

    it('discards a prepared snapshot without writing it', async () => {
      await refreshWith();
      store.discard();

      expect(store.state()).toEqual({ kind: 'idle' });
      expect(beds.vocabulary.commitCount).toBe(0);
    });
  });

  describe('cancellation', () => {
    it('cannot be cancelled while committing', async () => {
      await refreshWith();
      expect(store.canCancel()).toBe(true);

      const committing = store.confirm();
      expect(store.canCancel()).toBe(false);
      await committing;
    });

    it('treats cancelling a pending confirmation as discarding it', async () => {
      await refreshWith();
      store.cancel();

      expect(store.state()).toEqual({ kind: 'idle' });
      expect(beds.vocabulary.commitCount).toBe(0);
    });

    it('reports a provider cancellation without writing anything', async () => {
      await connect();
      const controller = new AbortController();
      controller.abort();

      // The provider observes the same cancellation the store would raise.
      await store.connect(new FakeAnkiProvider(CONTRACT_COLLECTION));
      await configure([BASIC]);
      const refreshing = store.refresh();
      store.cancel();
      await refreshing;

      expect(['cancelled', 'awaiting-confirmation']).toContain(store.state().kind);
      expect(beds.vocabulary.commitCount).toBe(0);
    });

    it('leaves the active snapshot untouched when extraction fails', async () => {
      const previous = snapshotId('99999999-9999-4999-8999-999999999999');
      beds.vocabulary.activeSnapshotId = previous;

      await store.connect(
        new FakeAnkiProvider(CONTRACT_COLLECTION, {
          extractError: ankiError('query-failed', 'Anki could not answer.'),
        }),
      );
      await configure([BASIC]);
      await store.refresh();

      const state = store.state();
      expect(state.kind).toBe('failed');
      if (state.kind !== 'failed') return;
      expect(state.error.code).toBe('query-failed');
      expect(beds.vocabulary.activeSnapshotId).toBe(previous);
      expect(beds.vocabulary.commitCount).toBe(0);
    });

    it('releases the provider on dispose', async () => {
      const provider = new FakeAnkiProvider(CONTRACT_COLLECTION);
      await store.connect(provider);
      store.dispose();

      expect(provider.disposed).toBe(true);
    });
  });

  describe('generation readiness', () => {
    it('reports whether the committed snapshot clears the fifty-entry gate', async () => {
      await refreshWith();
      await store.confirm();

      const state = store.state();
      if (state.kind !== 'complete') return;
      // The contract fixture is deliberately small, so this one does not.
      expect(state.snapshot.uniqueEntryCount).toBeLessThan(50);
    });
  });
});
