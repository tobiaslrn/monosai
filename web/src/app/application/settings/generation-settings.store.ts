import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_GENERATION_SETTINGS,
  repairBudgetFor,
  type GenerationSettings,
  type VocabularyStrictness,
} from '../../domain/settings/settings';
import type { StorageError } from '../../domain/storage/storage-error';
import { SETTINGS_REPOSITORY } from '../shared/repository-tokens';

/** Device-wide defaults captured by each generation when it starts. */
@Injectable({ providedIn: 'root' })
export class GenerationSettingsStore {
  private readonly repository = inject(SETTINGS_REPOSITORY);
  private readonly settingsSignal = signal<GenerationSettings>(DEFAULT_GENERATION_SETTINGS);
  private readonly failureSignal = signal<StorageError | null>(null);

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
      throw new Error(loaded.error.message);
    }
    this.settingsSignal.set(loaded.value);
    this.failureSignal.set(null);
  }

  async setVocabularyStrictness(strictness: VocabularyStrictness): Promise<void> {
    const previous = this.settingsSignal();
    this.settingsSignal.set({ ...previous, vocabularyStrictness: strictness });

    const saved = await this.repository.updateGenerationSettings({
      vocabularyStrictness: strictness,
    });
    if (saved.ok) {
      this.settingsSignal.set(saved.value);
      this.failureSignal.set(null);
    } else {
      this.settingsSignal.set(previous);
      this.failureSignal.set(saved.error);
    }
  }

  async setDefaultPreparationTargets(
    defaultPreparationTargets: GenerationSettings['defaultPreparationTargets'],
  ): Promise<void> {
    const previous = this.settingsSignal();
    this.settingsSignal.set({ ...previous, defaultPreparationTargets });
    const saved = await this.repository.updateGenerationSettings({ defaultPreparationTargets });
    if (saved.ok) {
      this.settingsSignal.set(saved.value);
      this.failureSignal.set(null);
    } else {
      this.settingsSignal.set(previous);
      this.failureSignal.set(saved.error);
    }
  }
}
