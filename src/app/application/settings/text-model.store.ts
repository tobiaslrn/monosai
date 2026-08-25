import { Injectable, computed, inject, signal } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import { textModelFingerprint } from '../../domain/ai/configuration-fingerprint';
import { readinessOf, type ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import {
  DEFAULT_TEXT_MODEL_SETTINGS,
  isValidStoryTokenBudget,
  type TextModelPreset,
  type TextModelSettings,
} from '../../domain/settings/settings';
import type { StorageError } from '../../domain/storage/storage-error';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, HASHER, SETTINGS_REPOSITORY } from '../shared/repository-tokens';
import { CredentialStore } from './credential.store';

export type TextModelAction = 'idle' | 'saving' | 'testing';

/**
 * The exact text model and its compatibility test.
 *
 * Nothing here reaches the provider on its own: a request happens only when the
 * learner presses Test. Readiness is derived from a fingerprint comparison
 * rather than stored as a flag, so changing the model or the key marks the test
 * stale without any code having to remember to invalidate it.
 */
@Injectable({ providedIn: 'root' })
export class TextModelStore {
  private readonly repository = inject(SETTINGS_REPOSITORY);
  private readonly provider = inject(TEXT_GENERATION_PROVIDER);
  private readonly credential = inject(CredentialStore);
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);

  private readonly settingsSignal = signal<TextModelSettings>(DEFAULT_TEXT_MODEL_SETTINGS);
  private readonly draftSignal = signal('');
  private readonly storyTokenBudgetDraftSignal = signal(
    String(DEFAULT_TEXT_MODEL_SETTINGS.storyTokenBudget),
  );
  private readonly actionSignal = signal<TextModelAction>('idle');
  private readonly testFailureSignal = signal<AiError | null>(null);
  private readonly storageFailureSignal = signal<StorageError | null>(null);

  private controller: AbortController | null = null;

  readonly settings = this.settingsSignal.asReadonly();
  readonly draftModelId = this.draftSignal.asReadonly();
  readonly storyTokenBudgetDraft = this.storyTokenBudgetDraftSignal.asReadonly();
  readonly action = this.actionSignal.asReadonly();
  readonly testFailure = this.testFailureSignal.asReadonly();
  readonly storageFailure = this.storageFailureSignal.asReadonly();
  /**
   * The mode the stored test proved, or null when no test currently vouches
   * for the configuration. Generation opens in this mode rather than spending a
   * format-recovery request every run to rediscover it. See ADR 0020.
   */
  readonly structuredOutput = computed(() => this.settingsSignal().structuredOutput);
  readonly presets = computed(() => this.settingsSignal().presets);
  readonly favoriteModelIds = computed(() => this.settingsSignal().favoriteModelIds ?? []);
  readonly activePresetId = computed(() => this.settingsSignal().activePresetId);
  readonly grammarPresetId = computed(() => this.settingsSignal().grammarPresetId);
  readonly compatiblePresets = computed(() =>
    this.settingsSignal().presets.filter((preset) => this.isPresetReady(preset)),
  );

  readonly lastTestedAt = computed(() => this.settingsSignal().lastTestedAt);

  /** Whether the field differs from what is stored, so Save can be offered. */
  readonly hasUnsavedModelId = computed(
    () => this.draftSignal().trim() !== this.settingsSignal().modelId,
  );

  readonly parsedStoryTokenBudget = computed(() => {
    const value = Number(this.storyTokenBudgetDraftSignal());
    return isValidStoryTokenBudget(value) ? value : null;
  });

  readonly isStoryTokenBudgetValid = computed(() => this.parsedStoryTokenBudget() !== null);

  readonly hasUnsavedStoryTokenBudget = computed(
    () => this.parsedStoryTokenBudget() !== this.settingsSignal().storyTokenBudget,
  );

  readonly readiness = computed<ConfigurationReadiness>(() => {
    const settings = this.settingsSignal();
    return readinessOf({
      complete: settings.modelId !== '',
      hasCredential: this.credential.isConfigured(),
      savedFingerprint: settings.lastTestFingerprint,
      currentFingerprint: this.fingerprintFor(settings.modelId),
      lastAttemptFailed: this.testFailureSignal() !== null,
    });
  });

  async load(): Promise<void> {
    const settings = await this.repository.getTextModelSettings();
    if (!settings.ok) {
      this.storageFailureSignal.set(settings.error);
      return;
    }
    this.settingsSignal.set(settings.value);
    this.draftSignal.set(settings.value.modelId);
    this.storyTokenBudgetDraftSignal.set(String(settings.value.storyTokenBudget));
    this.storageFailureSignal.set(null);
  }

  setDraftModelId(modelId: string): void {
    this.draftSignal.set(modelId);
  }

  setStoryTokenBudgetDraft(value: string): void {
    this.storyTokenBudgetDraftSignal.set(value);
  }

  async saveStoryTokenBudget(): Promise<boolean> {
    const storyTokenBudget = this.parsedStoryTokenBudget();
    if (storyTokenBudget === null) {
      return false;
    }
    if (!this.hasUnsavedStoryTokenBudget()) {
      return true;
    }

    this.actionSignal.set('saving');
    const saved = await this.repository.updateTextModelSettings({ storyTokenBudget });
    this.actionSignal.set('idle');

    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.storyTokenBudgetDraftSignal.set(String(saved.value.storyTokenBudget));
    this.storageFailureSignal.set(null);
    return true;
  }

  async registerPreset(preset: TextModelPreset): Promise<boolean> {
    const current = this.settingsSignal();
    const registered: TextModelPreset = {
      ...preset,
      lastTestFingerprint: preset.lastTestFingerprint ?? null,
      lastTestedAt: preset.lastTestedAt ?? null,
      structuredOutput: preset.structuredOutput ?? null,
    };
    const presets = [...current.presets.filter((item) => item.id !== preset.id), registered];
    const becomesDefault = current.activePresetId === null && this.isPresetReady(registered);
    const saved = await this.repository.updateTextModelSettings({
      presets,
      ...(becomesDefault
        ? {
            activePresetId: preset.id,
            modelId: preset.modelId,
            reasoningEffort: preset.reasoningEffort,
            structuredOutput: registered.structuredOutput ?? null,
            lastTestFingerprint: registered.lastTestFingerprint ?? null,
            lastTestedAt: registered.lastTestedAt ?? null,
          }
        : {}),
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.draftSignal.set(saved.value.modelId);
    this.storyTokenBudgetDraftSignal.set(String(saved.value.storyTokenBudget));
    this.testFailureSignal.set(null);
    return true;
  }

  async selectPreset(id: string): Promise<boolean> {
    if (this.settingsSignal().activePresetId === id) {
      return true;
    }
    const preset = this.settingsSignal().presets.find((item) => item.id === id);
    if (preset === undefined || !this.isPresetReady(preset)) {
      return false;
    }
    const saved = await this.repository.updateTextModelSettings({
      activePresetId: preset.id,
      modelId: preset.modelId,
      reasoningEffort: preset.reasoningEffort,
      structuredOutput: preset.structuredOutput ?? null,
      lastTestFingerprint: preset.lastTestFingerprint ?? null,
      lastTestedAt: preset.lastTestedAt ?? null,
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.draftSignal.set(saved.value.modelId);
    this.testFailureSignal.set(null);
    return true;
  }

  async setGrammarPreset(id: string | null): Promise<boolean> {
    if (id !== null) {
      const preset = this.settingsSignal().presets.find((item) => item.id === id);
      if (preset === undefined || !this.isPresetReady(preset)) {
        return false;
      }
    }
    const saved = await this.repository.updateTextModelSettings({ grammarPresetId: id });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    return true;
  }

  async setReasoningEffort(reasoningEffort: string | null): Promise<boolean> {
    const settings = this.settingsSignal();
    if (settings.reasoningEffort === reasoningEffort) return true;
    const saved = await this.repository.updateTextModelSettings({
      reasoningEffort,
      activePresetId: null,
      lastTestFingerprint: null,
      lastTestedAt: null,
      structuredOutput: null,
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.testFailureSignal.set(null);
    return true;
  }

  async toggleFavorite(modelId: string): Promise<boolean> {
    const current = this.settingsSignal().favoriteModelIds ?? [];
    const favoriteModelIds = current.includes(modelId)
      ? current.filter((id) => id !== modelId)
      : [...current, modelId];
    const saved = await this.repository.updateTextModelSettings({ favoriteModelIds });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    return true;
  }

  async updatePreset(
    id: string,
    patch: Pick<TextModelPreset, 'reasoningEffort'>,
  ): Promise<boolean> {
    const current = this.settingsSignal();
    const preset = current.presets.find((item) => item.id === id);
    if (preset === undefined) {
      return false;
    }
    const updated = {
      ...preset,
      ...patch,
      lastTestFingerprint: null,
      lastTestedAt: null,
      structuredOutput: null,
    };
    const saved = await this.repository.updateTextModelSettings({
      presets: current.presets.map((item) => (item.id === id ? updated : item)),
      ...(current.activePresetId === id
        ? {
            reasoningEffort: updated.reasoningEffort,
            lastTestFingerprint: null,
            lastTestedAt: null,
            structuredOutput: null,
          }
        : {}),
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    return true;
  }

  async removePreset(id: string): Promise<boolean> {
    const current = this.settingsSignal();
    const removed = current.presets.find((preset) => preset.id === id);
    if (removed === undefined) {
      return true;
    }
    const presets = current.presets.filter((preset) => preset.id !== id);
    const saved = await this.repository.updateTextModelSettings({
      presets,
      ...(current.activePresetId === id
        ? {
            activePresetId: null,
            modelId: '',
            reasoningEffort: null,
            structuredOutput: null,
            lastTestFingerprint: null,
            lastTestedAt: null,
          }
        : {}),
      ...(current.grammarPresetId === id ? { grammarPresetId: null } : {}),
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.draftSignal.set(saved.value.modelId);
    this.storyTokenBudgetDraftSignal.set(String(saved.value.storyTokenBudget));
    this.testFailureSignal.set(null);
    this.storageFailureSignal.set(null);
    return true;
  }

  /** Stores the model ID. The stored test result is left alone and reads stale. */
  async save(): Promise<boolean> {
    this.actionSignal.set('saving');
    const saved = await this.persistDraft();
    this.actionSignal.set('idle');
    return saved;
  }

  /** The write itself, without the action state, so a test can reuse it. */
  private async persistDraft(): Promise<boolean> {
    const modelId = this.draftSignal().trim();
    if (modelId === this.settingsSignal().modelId) {
      return true;
    }

    // The stored mode described the previous model, so it stops applying the
    // moment the model changes; readiness reads stale for the same reason.
    const saved = await this.repository.updateTextModelSettings({
      modelId,
      activePresetId: null,
      reasoningEffort: null,
      structuredOutput: null,
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.draftSignal.set(saved.value.modelId);
    this.storageFailureSignal.set(null);
    // A previous failure described a different configuration.
    this.testFailureSignal.set(null);
    return true;
  }

  /**
   * Tests the configuration as the learner sees it.
   *
   * The draft is saved first so that a passing test can never vouch for a model
   * ID other than the one that is stored.
   */
  async test(): Promise<void> {
    const id = this.settingsSignal().activePresetId;
    if (id !== null) {
      await this.testPreset(id);
      return;
    }
    // The controller exists before the first await so that cancelling while the
    // draft is still being written stops the attempt rather than being ignored.
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.actionSignal.set('testing');
    this.testFailureSignal.set(null);

    const persisted = await this.persistDraft();
    const modelId = this.settingsSignal().modelId;
    if (!persisted || modelId === '' || this.controller !== controller) {
      if (this.controller === controller) {
        this.controller = null;
        this.actionSignal.set('idle');
      }
      return;
    }

    const result = await this.provider.testConfiguration(
      { modelId, reasoningEffort: this.settingsSignal().reasoningEffort },
      controller.signal,
    );

    // A late answer from a superseded attempt must not overwrite the current one.
    if (this.controller !== controller) {
      return;
    }
    this.controller = null;
    this.actionSignal.set('idle');

    if (!result.ok) {
      this.testFailureSignal.set(result.error);
      return;
    }

    const saved = await this.repository.updateTextModelSettings({
      lastTestFingerprint: this.fingerprintFor(modelId),
      lastTestedAt: this.clock.now(),
      structuredOutput: result.value.structuredOutput,
    });
    if (saved.ok) {
      this.settingsSignal.set(saved.value);
      this.storageFailureSignal.set(null);
    } else {
      this.storageFailureSignal.set(saved.error);
    }
  }

  async testPreset(id: string): Promise<void> {
    const preset = this.settingsSignal().presets.find((item) => item.id === id);
    if (preset === undefined) {
      return;
    }
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.actionSignal.set('testing');
    this.testFailureSignal.set(null);
    const result = await this.provider.testConfiguration(
      { modelId: preset.modelId, reasoningEffort: preset.reasoningEffort },
      controller.signal,
    );
    if (this.controller !== controller) {
      return;
    }
    this.controller = null;
    this.actionSignal.set('idle');
    if (!result.ok) {
      this.testFailureSignal.set(result.error);
      return;
    }
    const fingerprint = this.fingerprintForConfig(preset.modelId, preset.reasoningEffort);
    const testedAt = this.clock.now();
    const presets = this.settingsSignal().presets.map((item) =>
      item.id === id
        ? {
            ...item,
            lastTestFingerprint: fingerprint,
            lastTestedAt: testedAt,
            structuredOutput: result.value.structuredOutput,
          }
        : item,
    );
    const isDefault = this.settingsSignal().activePresetId === id;
    const becomesDefault = this.settingsSignal().activePresetId === null;
    const saved = await this.repository.updateTextModelSettings({
      presets,
      ...(isDefault || becomesDefault
        ? {
            activePresetId: id,
            modelId: preset.modelId,
            reasoningEffort: preset.reasoningEffort,
            lastTestFingerprint: fingerprint,
            lastTestedAt: testedAt,
            structuredOutput: result.value.structuredOutput,
          }
        : {}),
    });
    if (saved.ok) {
      this.settingsSignal.set(saved.value);
      this.storageFailureSignal.set(null);
    } else {
      this.storageFailureSignal.set(saved.error);
    }
  }

  configForPreset(id: string | null): {
    readonly modelId: string;
    readonly reasoningEffort: string | null;
    readonly structuredOutput: NonNullable<TextModelSettings['structuredOutput']>;
    readonly storyTokenBudget: number;
  } | null {
    const preset = this.settingsSignal().presets.find((item) => item.id === id);
    if (preset === undefined || !this.isPresetReady(preset) || preset.structuredOutput == null) {
      return null;
    }
    return {
      modelId: preset.modelId,
      reasoningEffort: preset.reasoningEffort,
      structuredOutput: preset.structuredOutput,
      storyTokenBudget: this.settingsSignal().storyTokenBudget,
    };
  }

  configForTask(task: 'text' | 'grammar'): {
    readonly modelId: string;
    readonly reasoningEffort: string | null;
    readonly structuredOutput: NonNullable<TextModelSettings['structuredOutput']>;
    readonly storyTokenBudget: number;
  } | null {
    const settings = this.settingsSignal();
    const presetId =
      task === 'grammar'
        ? (settings.grammarPresetId ?? settings.activePresetId)
        : settings.activePresetId;
    const preset = this.configForPreset(presetId);
    if (preset !== null) {
      return preset;
    }
    return settings.modelId !== '' && settings.structuredOutput !== null
      ? {
          modelId: settings.modelId,
          reasoningEffort: settings.reasoningEffort,
          structuredOutput: settings.structuredOutput,
          storyTokenBudget: settings.storyTokenBudget,
        }
      : null;
  }

  cancelTest(): void {
    this.controller?.abort();
    this.controller = null;
    this.actionSignal.set('idle');
  }

  private fingerprintFor(modelId: string): string {
    return this.fingerprintForConfig(modelId, this.settingsSignal().reasoningEffort);
  }

  private fingerprintForConfig(modelId: string, reasoningEffort: string | null): string {
    return textModelFingerprint(this.hasher, this.credential.keyGeneration(), {
      modelId,
      reasoningEffort,
    });
  }

  private isPresetReady(preset: TextModelPreset): boolean {
    return (
      preset.structuredOutput != null &&
      preset.lastTestFingerprint ===
        this.fingerprintForConfig(preset.modelId, preset.reasoningEffort)
    );
  }
}
