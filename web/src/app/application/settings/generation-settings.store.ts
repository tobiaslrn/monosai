import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_GENERATION_SETTINGS,
  repairBudgetFor,
  type GenerationSettings,
  type VocabularyStrictness,
} from '../../domain/settings/settings';
import { StorageFailure, type StorageError } from '../../domain/storage/storage-error';
import { SETTINGS_REPOSITORY } from '../shared/repository-tokens';
import { OptimisticRow } from './optimistic-row';

/** Device-wide defaults captured by each generation when it starts. */
@Injectable({ providedIn: 'root' })
export class GenerationSettingsStore {
  private readonly repository = inject(SETTINGS_REPOSITORY);
  private readonly settingsSignal = signal<GenerationSettings>(DEFAULT_GENERATION_SETTINGS);
  private readonly failureSignal = signal<StorageError | null>(null);
  private readonly row = new OptimisticRow(this.settingsSignal);

  readonly settings = this.settingsSignal.asReadonly();
  readonly vocabularyStrictness = computed(() => this.settingsSignal().vocabularyStrictness);
  readonly defaultPreparationTargets = computed(
    () => this.settingsSignal().defaultPreparationTargets,
  );
  readonly repairBudget = computed(() => repairBudgetFor(this.vocabularyStrictness()));
  readonly failure = this.failureSignal.asReadonly();

  /** Loads persisted settings during bootstrap. Failures are fatal for startup. */
  async load(): Promise<void> {
    const loaded = await this.repository.getGenerationSettings();
    if (!loaded.ok) {
      this.failureSignal.set(loaded.error);
      throw new StorageFailure(loaded.error);
    }
    this.row.setStored(loaded.value);
    this.failureSignal.set(null);
  }

  setVocabularyStrictness(vocabularyStrictness: VocabularyStrictness): Promise<void> {
    return this.save({ vocabularyStrictness });
  }

  setDefaultPreparationTargets(
    defaultPreparationTargets: GenerationSettings['defaultPreparationTargets'],
  ): Promise<void> {
    return this.save({ defaultPreparationTargets });
  }

  /**
   * Shows a patch at once and takes it away again if the write fails, leaving
   * what is stored and any other change still being written.
   */
  private async save(patch: Partial<GenerationSettings>): Promise<void> {
    const saved = await this.row.write(patch, (change) =>
      this.repository.updateGenerationSettings(change),
    );
    this.failureSignal.set(saved.ok ? null : saved.error);
  }
}
