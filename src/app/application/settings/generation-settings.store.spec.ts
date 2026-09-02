import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GENERATION_SETTINGS,
  type GenerationSettings,
} from '../../domain/settings/settings';
import type { SettingsRepository } from '../../domain/settings/settings-repository';
import type { StorageError } from '../../domain/storage/storage-error';
import { err, ok, type Result } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import { SETTINGS_REPOSITORY } from '../shared/repository-tokens';
import { GenerationSettingsStore } from './generation-settings.store';

type GenerationSettingsRepository = Pick<
  SettingsRepository,
  'getGenerationSettings' | 'updateGenerationSettings'
>;

class StubGenerationSettingsRepository implements GenerationSettingsRepository {
  stored = DEFAULT_GENERATION_SETTINGS;
  failNextWrite = false;

  getGenerationSettings(): Promise<Result<GenerationSettings, StorageError>> {
    return Promise.resolve(ok(this.stored));
  }

  updateGenerationSettings(
    patch: Partial<GenerationSettings>,
  ): Promise<Result<GenerationSettings, StorageError>> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      return Promise.resolve(err(storageError('unavailable', 'Settings are unavailable.')));
    }
    this.stored = { ...this.stored, ...patch, updatedAt: 1 };
    return Promise.resolve(ok(this.stored));
  }
}

describe('GenerationSettingsStore', () => {
  let repository: StubGenerationSettingsRepository;
  let store: GenerationSettingsStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    repository = new StubGenerationSettingsRepository();
    TestBed.configureTestingModule({
      providers: [{ provide: SETTINGS_REPOSITORY, useValue: repository }],
    });
    store = TestBed.inject(GenerationSettingsStore);
  });

  it('loads standard vocabulary strictness and the English and grammar defaults', async () => {
    await store.load();

    expect(store.vocabularyStrictness()).toBe('standard');
    expect(store.repairBudget()).toBe(1);
    expect(store.defaultPreparationTargets()).toEqual(['english', 'grammar']);
  });

  it('persists a strictness change and exposes its repair budget', async () => {
    await store.setVocabularyStrictness('strict');

    expect(store.vocabularyStrictness()).toBe('strict');
    expect(store.repairBudget()).toBe(2);
    expect(repository.stored.vocabularyStrictness).toBe('strict');
  });

  it('rolls an optimistic strictness change back when storage fails', async () => {
    repository.failNextWrite = true;

    await store.setVocabularyStrictness('relaxed');

    expect(store.vocabularyStrictness()).toBe('standard');
    expect(store.failure()?.code).toBe('unavailable');
  });
});
