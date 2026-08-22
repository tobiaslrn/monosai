import { Injectable, computed, inject, signal } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import { textModelFingerprint } from '../../domain/ai/configuration-fingerprint';
import { readinessOf, type ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import {
  DEFAULT_TEXT_MODEL_SETTINGS,
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
  private readonly actionSignal = signal<TextModelAction>('idle');
  private readonly testFailureSignal = signal<AiError | null>(null);
  private readonly storageFailureSignal = signal<StorageError | null>(null);

  private controller: AbortController | null = null;

  readonly settings = this.settingsSignal.asReadonly();
  readonly draftModelId = this.draftSignal.asReadonly();
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
  readonly activePresetId = computed(() => this.settingsSignal().activePresetId);

  readonly lastTestedAt = computed(() => this.settingsSignal().lastTestedAt);

  /** Whether the field differs from what is stored, so Save can be offered. */
  readonly hasUnsavedModelId = computed(
    () => this.draftSignal().trim() !== this.settingsSignal().modelId,
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
    this.storageFailureSignal.set(null);
  }

  setDraftModelId(modelId: string): void {
    this.draftSignal.set(modelId);
  }

  async registerPreset(preset: TextModelPreset): Promise<boolean> {
    const current = this.settingsSignal();
    const presets = [...current.presets.filter((item) => item.id !== preset.id), preset];
    const saved = await this.repository.updateTextModelSettings({
      presets,
      activePresetId: preset.id,
      modelId: preset.modelId,
      reasoningEffort: preset.reasoningEffort,
      structuredOutput: null,
      lastTestFingerprint: null,
      lastTestedAt: null,
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.draftSignal.set(preset.modelId);
    this.testFailureSignal.set(null);
    return true;
  }

  async selectPreset(id: string): Promise<boolean> {
    if (this.settingsSignal().activePresetId === id) {
      return true;
    }
    const preset = this.settingsSignal().presets.find((item) => item.id === id);
    return preset === undefined ? false : this.registerPreset(preset);
  }

  async removePreset(id: string): Promise<boolean> {
    const current = this.settingsSignal();
    const removed = current.presets.find((preset) => preset.id === id);
    if (removed === undefined) {
      return true;
    }
    const presets = current.presets.filter((preset) => preset.id !== id);
    const replacement = current.activePresetId === id ? (presets[0] ?? null) : null;
    const saved = await this.repository.updateTextModelSettings({
      presets,
      ...(current.activePresetId === id
        ? {
            activePresetId: replacement?.id ?? null,
            modelId: replacement?.modelId ?? '',
            reasoningEffort: replacement?.reasoningEffort ?? null,
            structuredOutput: null,
            lastTestFingerprint: null,
            lastTestedAt: null,
          }
        : {}),
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.draftSignal.set(saved.value.modelId);
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

  cancelTest(): void {
    this.controller?.abort();
    this.controller = null;
    this.actionSignal.set('idle');
  }

  private fingerprintFor(modelId: string): string {
    return textModelFingerprint(this.hasher, this.credential.keyGeneration(), {
      modelId,
      reasoningEffort: this.settingsSignal().reasoningEffort,
    });
  }
}
