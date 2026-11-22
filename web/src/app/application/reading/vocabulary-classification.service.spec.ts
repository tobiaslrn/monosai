import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotId } from '../../domain/shared/ids';
import type { VocabularyItem } from '../../domain/vocabulary/snapshot';
import type { MonosaiDatabase } from '../../infrastructure/persistence/monosai-db';
import { DexieVocabularyRepository } from '../../infrastructure/persistence/repositories/dexie-vocabulary.repository';
import { snapshotFixture } from '../../../testing/persistence-fixtures';
import { FakeLanguageRuntime } from '../../../testing/reading-fakes';
import { createTestDatabase, destroyTestDatabase } from '../../../testing/test-database';
import { LanguageStore } from '../language/language.store';
import { AppSettingsStore } from '../settings/app-settings.store';
import { LANGUAGE_RUNTIME } from '../shared/language-tokens';
import { VOCABULARY_REPOSITORY } from '../shared/repository-tokens';
import { VocabularyClassificationService } from './vocabulary-classification.service';

describe('VocabularyClassificationService', () => {
  let db: MonosaiDatabase;
  let repository: DexieVocabularyRepository;
  let runtime: FakeLanguageRuntime;
  let compiled: (readonly VocabularyItem[])[];
  const active = signal<SnapshotId | null>(null);

  beforeEach(async () => {
    TestBed.resetTestingModule();
    db = await createTestDatabase();
    repository = new DexieVocabularyRepository(db);
    runtime = new FakeLanguageRuntime();
    compiled = [];
    const compile = runtime.compileSnapshot.bind(runtime);
    vi.spyOn(runtime, 'compileSnapshot').mockImplementation((id, items) => {
      compiled.push(items);
      return compile(id, items);
    });
    TestBed.configureTestingModule({
      providers: [
        VocabularyClassificationService,
        { provide: LANGUAGE_RUNTIME, useValue: runtime },
        { provide: VOCABULARY_REPOSITORY, useValue: repository },
        { provide: AppSettingsStore, useValue: { activeSnapshotId: active } },
        { provide: LanguageStore, useValue: { initialize: () => Promise.resolve(true) } },
      ],
    });
  });

  afterEach(async () => {
    await destroyTestDatabase(db);
  });

  it('classifies against a vocabulary another tab has committed since', async () => {
    const first = await repository.commitSnapshot(snapshotFixture(1, 3));
    if (!first.ok) throw new Error('the first commit should succeed');
    active.set(first.value.id);
    const service = TestBed.inject(VocabularyClassificationService);
    const sentences = [{ sentenceId: 'sentence-1', tokens: [] }];
    await service.classify(sentences);

    // Another tab refreshes the vocabulary. Its own classifier is invalidated;
    // this tab's is not told anything.
    const second = await repository.commitSnapshot({
      ...snapshotFixture(2, 5),
      expectedRevision: 'revision-1',
    });
    if (!second.ok) throw new Error('the second commit should succeed');
    active.set(second.value.id);
    await service.classify(sentences);

    expect(compiled.at(-1)).toHaveLength(5);
  });

  it('keeps the matcher while the vocabulary is unchanged', async () => {
    const first = await repository.commitSnapshot(snapshotFixture(1, 3));
    if (!first.ok) throw new Error('the first commit should succeed');
    active.set(first.value.id);
    const service = TestBed.inject(VocabularyClassificationService);
    const sentences = [{ sentenceId: 'sentence-1', tokens: [] }];

    await service.classify(sentences);
    await service.classify(sentences);

    expect(compiled).toHaveLength(1);
  });

  it('rebuilds after an invalidation that arrived while the matcher was being built', async () => {
    const first = await repository.commitSnapshot(snapshotFixture(1, 3));
    if (!first.ok) throw new Error('the first commit should succeed');
    active.set(first.value.id);
    const service = TestBed.inject(VocabularyClassificationService);
    const sentences = [{ sentenceId: 'sentence-1', tokens: [] }];
    const recordingCompile = runtime.compileSnapshot.bind(runtime);
    vi.spyOn(runtime, 'compileSnapshot').mockImplementationOnce((id, items) => {
      // This tab commits a vocabulary and invalidates while the build runs.
      service.invalidate();
      return recordingCompile(id, items);
    });

    await service.classify(sentences);
    await service.classify(sentences);

    expect(compiled).toHaveLength(2);
  });

  it('rebuilds the matcher once the runtime has lost its state', async () => {
    const snapshot = await repository.commitSnapshot(snapshotFixture(1, 3));
    if (!snapshot.ok) throw new Error('the commit should succeed');
    active.set(snapshot.value.id);
    const service = TestBed.inject(VocabularyClassificationService);
    const sentences = [{ sentenceId: 'sentence-1', tokens: [] }];
    await service.classify(sentences);

    // The worker crashed; the fresh one has no matcher.
    runtime.loseState();
    await service.classify(sentences);

    expect(compiled).toHaveLength(2);
  });
});
