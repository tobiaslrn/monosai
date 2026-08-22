import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { LanguageStore } from '../app/application/language/language.store';
import { VocabularyClassificationService } from '../app/application/reading/vocabulary-classification.service';
import { MARKUP_TEXT_EXTRACTOR } from '../app/application/shared/anki-tokens';
import { LANGUAGE_RUNTIME } from '../app/application/shared/language-tokens';
import {
  CLOCK,
  HASHER,
  ID_GENERATOR,
  SETTINGS_REPOSITORY,
  SOURCE_MAPPING_REPOSITORY,
  VOCABULARY_REPOSITORY,
} from '../app/application/shared/repository-tokens';
import { SnapshotBuilder } from '../app/application/vocabulary/snapshot-builder';
import { SourceMappingStore } from '../app/application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../app/application/vocabulary/vocabulary-refresh.store';
import type { AnalyzedSentence } from '../app/domain/language/analyzed-text';
import { fixedClock } from '../app/domain/shared/clock';
import type { Hasher } from '../app/domain/shared/hashing';
import type { SnapshotId, VocabularySourceId } from '../app/domain/shared/ids';
import { ok, type Result } from '../app/domain/shared/result';
import { storageError, type StorageError } from '../app/domain/storage/storage-error';
import type { AppSettings, ReaderPreferences } from '../app/domain/settings/settings';
import { DEFAULT_APP_SETTINGS, DEFAULT_READER_PREFERENCES } from '../app/domain/settings/settings';
import type { SettingsRepository } from '../app/domain/settings/settings-repository';
import type {
  VocabularyItem,
  VocabularyProvenance,
  VocabularySnapshot,
} from '../app/domain/vocabulary/snapshot';
import type { SourceMappingRepository } from '../app/domain/vocabulary/source-mapping-repository';
import type {
  VocabularySource,
  VocabularySourceCache,
} from '../app/domain/vocabulary/vocabulary-source';
import type {
  SnapshotCommit,
  VocabularyRepository,
} from '../app/domain/vocabulary/vocabulary-repository';
import { DomMarkupTextExtractor } from '../app/infrastructure/anki/dom-markup-text';
import { FakeLanguageRuntime } from './reading-fakes';

const FIXED_NOW = 1_700_000_000_000;

/**
 * An in-memory vocabulary repository that records what reached it. Like the
 * production repository, it keeps only the current vocabulary replacement.
 *
 * `commitSnapshot` can be made to fail so the tests can prove the thing that
 * matters most: a failed commit leaves the previous current vocabulary exactly
 * as it was.
 */
export class StubVocabularyRepository implements VocabularyRepository {
  readonly snapshots: VocabularySnapshot[] = [];
  readonly items: VocabularyItem[] = [];
  readonly provenance: VocabularyProvenance[] = [];
  activeSnapshotId: SnapshotId | null = null;
  commitFailure: StorageError | null = null;
  commitCount = 0;

  commitSnapshot(commit: SnapshotCommit): Promise<Result<VocabularySnapshot, StorageError>> {
    this.commitCount += 1;
    if (this.commitFailure !== null) {
      // Exactly like the real transaction aborting: nothing is written and the
      // The current vocabulary is untouched.
      return Promise.resolve({ ok: false, error: this.commitFailure });
    }
    const id = this.activeSnapshotId ?? commit.snapshot.id;
    const snapshot = id === commit.snapshot.id ? commit.snapshot : { ...commit.snapshot, id };
    this.snapshots.splice(0, this.snapshots.length, snapshot);
    this.items.splice(
      0,
      this.items.length,
      ...commit.items.map((item) => ({ ...item, snapshotId: id })),
    );
    this.provenance.splice(0, this.provenance.length, ...commit.provenance);
    this.activeSnapshotId = id;
    return Promise.resolve(ok(snapshot));
  }

  listSnapshots(): Promise<Result<readonly VocabularySnapshot[], StorageError>> {
    return Promise.resolve(ok([...this.snapshots]));
  }

  getActiveSnapshot(): Promise<Result<VocabularySnapshot | null, StorageError>> {
    const active = this.snapshots.find((snapshot) => snapshot.id === this.activeSnapshotId);
    return Promise.resolve(ok(active ?? null));
  }

  getSnapshot(id: SnapshotId): Promise<Result<VocabularySnapshot | null, StorageError>> {
    return Promise.resolve(ok(this.snapshots.find((snapshot) => snapshot.id === id) ?? null));
  }

  async *streamItems(id: SnapshotId): AsyncIterable<readonly VocabularyItem[]> {
    await Promise.resolve();
    yield this.items.filter((item) => item.snapshotId === id);
  }

  listProvenance(id: SnapshotId): Promise<Result<readonly VocabularyProvenance[], StorageError>> {
    const ids = new Set(this.items.filter((item) => item.snapshotId === id).map((item) => item.id));
    return Promise.resolve(
      ok(this.provenance.filter((record) => ids.has(record.vocabularyItemId))),
    );
  }

  countStoriesUsingSnapshot(): Promise<Result<number, StorageError>> {
    return Promise.resolve(ok(0));
  }
}

export class StubSourceMappingRepository implements SourceMappingRepository {
  readonly stored = new Map<VocabularySourceId, VocabularySource>();
  readonly caches = new Map<VocabularySourceId, VocabularySourceCache>();
  saveFailure: StorageError | null = null;

  list(): Promise<Result<readonly VocabularySource[], StorageError>> {
    return Promise.resolve(ok([...this.stored.values()]));
  }

  save(mapping: VocabularySource): Promise<Result<VocabularySource, StorageError>> {
    if (this.saveFailure !== null) {
      return Promise.resolve({ ok: false, error: this.saveFailure });
    }
    this.stored.set(mapping.id, mapping);
    return Promise.resolve(ok(mapping));
  }

  remove(id: VocabularySourceId): Promise<Result<void, StorageError>> {
    this.stored.delete(id);
    this.caches.delete(id);
    return Promise.resolve(ok(undefined));
  }

  setEnabled(
    id: VocabularySourceId,
    enabled: boolean,
  ): Promise<Result<VocabularySource, StorageError>> {
    const existing = this.stored.get(id);
    if (existing === undefined) {
      return Promise.resolve({ ok: false, error: storageError('not-found', 'gone') });
    }
    const updated = { ...existing, enabled };
    this.stored.set(id, updated);
    return Promise.resolve(ok(updated));
  }

  readCaches(
    ids: readonly VocabularySourceId[],
  ): Promise<Result<readonly VocabularySourceCache[], StorageError>> {
    return Promise.resolve(
      ok(ids.flatMap((id) => (this.caches.has(id) ? [this.caches.get(id)!] : []))),
    );
  }

  replaceCaches(caches: readonly VocabularySourceCache[]): Promise<Result<void, StorageError>> {
    for (const cache of caches) {
      this.caches.set(cache.sourceId, cache);
    }
    return Promise.resolve(ok(undefined));
  }
}

/**
 * The part of the settings port these specs touch.
 *
 * `AppSettingsStore` only reads and writes app settings and reader preferences;
 * stubbing the model, TTS, policy, and asset methods would be eight bodies that
 * assert nothing.
 */
type SettingsSubset = Pick<
  SettingsRepository,
  'getAppSettings' | 'updateAppSettings' | 'getReaderPreferences' | 'updateReaderPreferences'
>;

/** Settings backed by the vocabulary stub, so activation stays consistent. */
export class StubSettingsRepository implements SettingsSubset {
  constructor(private readonly vocabulary: StubVocabularyRepository) {}

  private preferences: ReaderPreferences = DEFAULT_READER_PREFERENCES;

  getAppSettings(): Promise<Result<AppSettings, StorageError>> {
    return Promise.resolve(
      ok({ ...DEFAULT_APP_SETTINGS, activeSnapshotId: this.vocabulary.activeSnapshotId }),
    );
  }

  updateAppSettings(patch: Partial<AppSettings>): Promise<Result<AppSettings, StorageError>> {
    return Promise.resolve(
      ok({
        ...DEFAULT_APP_SETTINGS,
        activeSnapshotId: this.vocabulary.activeSnapshotId,
        ...patch,
      }),
    );
  }

  getReaderPreferences(): Promise<Result<ReaderPreferences, StorageError>> {
    return Promise.resolve(ok(this.preferences));
  }

  updateReaderPreferences(
    patch: Partial<ReaderPreferences>,
  ): Promise<Result<ReaderPreferences, StorageError>> {
    this.preferences = { ...this.preferences, ...patch };
    return Promise.resolve(ok(this.preferences));
  }
}

/**
 * A language runtime that tokenizes each expression into one whole-string
 * token.
 *
 * Real tokenization is covered by the golden corpus; what these specs need is
 * something deterministic that still exercises the batching and the mapping
 * from analysis back onto expressions.
 */
export class SingleTokenLanguageRuntime extends FakeLanguageRuntime {
  readonly analyzedBatches: (readonly string[])[] = [];

  override analyzeSentences(
    texts: readonly string[],
    signal?: AbortSignal,
  ): Promise<Result<readonly AnalyzedSentence[], never>> {
    this.analyzedBatches.push([...texts]);
    if (signal?.aborted === true) {
      return Promise.resolve(ok([]));
    }
    return Promise.resolve(
      ok(
        texts.map((text) => ({
          startUtf16: 0,
          endUtf16: text.length,
          text,
          tokens: [
            {
              id: 't0',
              startUtf16: 0,
              endUtf16: text.length,
              surface: text,
              lemma: text,
              readingHiragana: text,
              dictionaryKeys: [],
              isPunctuation: false,
            },
          ],
        })),
      ),
    );
  }
}

const TEST_HASHER: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

export interface VocabularyTestBed {
  readonly vocabulary: StubVocabularyRepository;
  readonly mappings: StubSourceMappingRepository;
  readonly runtime: SingleTokenLanguageRuntime;
}

/** Sequential ids, so a failing assertion names something readable. */
function sequentialIds(): { nextId: () => string } {
  let next = 0;
  return {
    nextId: () => {
      next += 1;
      return `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
    },
  };
}

/**
 * Configures a TestBed with the real vocabulary stores over stubbed ports.
 *
 * The stores under test are real: only storage, the language worker, and the
 * clock are replaced, so a refresh in these specs runs the same state machine
 * the application does.
 */
export function configureVocabularyTestBed(): VocabularyTestBed {
  const vocabulary = new StubVocabularyRepository();
  const mappings = new StubSourceMappingRepository();
  const runtime = new SingleTokenLanguageRuntime();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      SnapshotBuilder,
      SourceMappingStore,
      VocabularyRefreshStore,
      VocabularyClassificationService,
      { provide: VOCABULARY_REPOSITORY, useValue: vocabulary },
      { provide: SOURCE_MAPPING_REPOSITORY, useValue: mappings },
      { provide: SETTINGS_REPOSITORY, useValue: new StubSettingsRepository(vocabulary) },
      { provide: LANGUAGE_RUNTIME, useValue: runtime },
      { provide: MARKUP_TEXT_EXTRACTOR, useValue: new DomMarkupTextExtractor() },
      { provide: HASHER, useValue: TEST_HASHER },
      { provide: CLOCK, useValue: fixedClock(FIXED_NOW) },
      { provide: ID_GENERATOR, useValue: sequentialIds() },
      { provide: LanguageStore, useValue: { initialize: () => Promise.resolve(true) } },
    ],
  });

  return { vocabulary, mappings, runtime };
}
