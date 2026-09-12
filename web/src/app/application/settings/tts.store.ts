import {
  configurationTestFailure,
  recordConfigurationFailure,
} from '../../domain/ai/failed-configuration-test';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import { ttsFingerprint } from '../../domain/ai/configuration-fingerprint';
import { readinessOf, type ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import { declaredSpeechCapabilities, type StyleControl } from '../../domain/ai/speech-capabilities';
import { resolveTtsVoice } from '../../domain/ai/tts-configuration';
import {
  DEFAULT_TTS_SETTINGS,
  type TtsPreset,
  type TtsSettings,
} from '../../domain/settings/settings';
import type { SpeechStyle } from '../../domain/ai/speech-instructions';
import type { StorageError } from '../../domain/storage/storage-error';
import { TEXT_TO_SPEECH_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, HASHER, SETTINGS_REPOSITORY } from '../shared/repository-tokens';
import { CredentialStore } from './credential.store';

export type TtsAction = 'idle' | 'saving' | 'testing';

export interface TtsDraft {
  readonly modelId: string;
  readonly voiceId: string;
  readonly speechStyle: SpeechStyle;
}

/**
 * The exact TTS model, voice, and speaking style, with their own test.
 *
 * Deliberately a separate store from the text model rather than a mode of one:
 * speech is optional, its failures must never be reported as a text-model
 * problem, and nothing here can block reading or generation.
 */
@Injectable({ providedIn: 'root' })
export class TtsStore {
  private readonly repository = inject(SETTINGS_REPOSITORY);
  private readonly provider = inject(TEXT_TO_SPEECH_PROVIDER);
  private readonly credential = inject(CredentialStore);
  private readonly hasher = inject(HASHER);
  private readonly clock = inject(CLOCK);

  private readonly settingsSignal = signal<TtsSettings>(DEFAULT_TTS_SETTINGS);
  private readonly draftSignal = signal<TtsDraft>({
    modelId: '',
    voiceId: '',
    speechStyle: DEFAULT_TTS_SETTINGS.speechStyle,
  });
  private readonly actionSignal = signal<TtsAction>('idle');
  private readonly testFailureSignal = signal<AiError | null>(null);
  private readonly failureFingerprint = signal<string | null>(null);
  private readonly storageFailureSignal = signal<StorageError | null>(null);
  private readonly instructionsAppliedSignal = signal<boolean | null>(null);
  private readonly sampleSignal = signal<Blob | null>(null);
  private readonly testCancelledSignal = signal(false);

  private controller: AbortController | null = null;

  readonly settings = this.settingsSignal.asReadonly();
  readonly draft = this.draftSignal.asReadonly();
  readonly action = this.actionSignal.asReadonly();
  readonly testFailure = computed(() => {
    const fingerprint = this.fingerprintFor(this.settingsSignal());
    return (
      (this.failureFingerprint() === fingerprint ? this.testFailureSignal() : null) ??
      configurationTestFailure(this.settingsSignal().failedTests, fingerprint, 'tts-test')
    );
  });
  readonly storageFailure = this.storageFailureSignal.asReadonly();
  /** False when the provider refused the delivery direction the test tried. */
  readonly speechInstructionsApplied = this.instructionsAppliedSignal.asReadonly();
  /** The verified clip, played only on an explicit action. */
  readonly sample = this.sampleSignal.asReadonly();
  /**
   * True when the learner stopped the last test rather than it answering.
   *
   * Readiness cannot carry this: a cancelled test proves nothing, so the
   * configuration is still untested or stale, and only the surface that offers
   * the retry needs to say which of the two ways it got there.
   */
  readonly testCancelled = this.testCancelledSignal.asReadonly();

  readonly lastTestedAt = computed(() => this.settingsSignal().lastTestedAt);
  /**
   * Whether the saved speaking style can reach the model.
   *
   * Read from what the last test measured, not from a catalog, so it survives a
   * reload and an offline session.
   */
  readonly styleControl = computed<StyleControl>(() => {
    const settings = this.settingsSignal();
    return settings.speechInstructions === 'supported' ? 'prompted' : 'none';
  });
  readonly presets = computed(() => this.settingsSignal().presets);
  readonly favoriteModelIds = computed(() => this.settingsSignal().favoriteModelIds ?? []);
  readonly activePresetId = computed(() => this.settingsSignal().activePresetId);
  readonly compatiblePresets = computed(() =>
    this.settingsSignal().presets.filter((preset) => this.isPresetReady(preset)),
  );

  readonly hasUnsavedChanges = computed(() => {
    const draft = this.draftSignal();
    const settings = this.settingsSignal();
    return (
      draft.modelId.trim() !== settings.modelId ||
      draft.voiceId.trim() !== settings.voiceId ||
      draft.speechStyle !== settings.speechStyle
    );
  });

  readonly readiness = computed<ConfigurationReadiness>(() => {
    const settings = this.settingsSignal();
    return readinessOf({
      complete: settings.modelId !== '' && settings.voiceId !== '',
      hasCredential: this.credential.isConfigured(),
      savedFingerprint: settings.lastTestFingerprint,
      currentFingerprint: this.fingerprintFor(settings),
      lastAttemptFailed: this.testFailure() !== null,
    });
  });

  async load(): Promise<void> {
    const settings = await this.repository.getTtsSettings();
    if (!settings.ok) {
      this.storageFailureSignal.set(settings.error);
      return;
    }
    this.settingsSignal.set(settings.value);
    this.draftSignal.set({
      modelId: settings.value.modelId,
      voiceId: settings.value.voiceId,
      speechStyle: settings.value.speechStyle,
    });
    this.storageFailureSignal.set(null);
  }

  setDraft(patch: Partial<TtsDraft>): void {
    this.draftSignal.update((draft) => ({ ...draft, ...patch }));
  }

  async registerPreset(preset: TtsPreset): Promise<boolean> {
    const current = this.settingsSignal();
    const registered: TtsPreset = {
      ...preset,
      speechStyle: preset.speechStyle,
      speechInstructions: preset.speechInstructions ?? 'unsupported',
      lastTestFingerprint: preset.lastTestFingerprint ?? null,
      lastTestedAt: preset.lastTestedAt ?? null,
    };
    const presets = [...current.presets.filter((item) => item.id !== preset.id), registered];
    const becomesDefault = current.activePresetId === null && this.isPresetReady(registered);
    const saved = await this.repository.updateTtsSettings({
      presets,
      ...(becomesDefault
        ? {
            activePresetId: preset.id,
            modelId: preset.modelId,
            voiceId: preset.voiceId,
            speechStyle: registered.speechStyle,
            speechInstructions: registered.speechInstructions ?? 'unsupported',
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
    this.draftSignal.set({
      modelId: saved.value.modelId,
      voiceId: saved.value.voiceId,
      speechStyle: saved.value.speechStyle,
    });
    this.testFailureSignal.set(null);
    this.sampleSignal.set(null);
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
    const saved = await this.repository.updateTtsSettings({
      activePresetId: preset.id,
      modelId: preset.modelId,
      voiceId: preset.voiceId,
      speechStyle: preset.speechStyle,
      speechInstructions: preset.speechInstructions ?? 'unsupported',
      lastTestFingerprint: preset.lastTestFingerprint ?? null,
      lastTestedAt: preset.lastTestedAt ?? null,
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.draftSignal.set({
      modelId: preset.modelId,
      voiceId: preset.voiceId,
      speechStyle: preset.speechStyle,
    });
    this.testFailureSignal.set(null);
    return true;
  }

  async toggleFavorite(modelId: string): Promise<boolean> {
    const current = this.settingsSignal().favoriteModelIds ?? [];
    const favoriteModelIds = current.includes(modelId)
      ? current.filter((id) => id !== modelId)
      : [...current, modelId];
    const saved = await this.repository.updateTtsSettings({ favoriteModelIds });
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
    const saved = await this.repository.updateTtsSettings({
      presets,
      ...(current.activePresetId === id
        ? {
            activePresetId: null,
            modelId: '',
            voiceId: '',
            speechStyle: DEFAULT_TTS_SETTINGS.speechStyle,
            speechInstructions: DEFAULT_TTS_SETTINGS.speechInstructions,
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
    this.draftSignal.set({
      modelId: saved.value.modelId,
      voiceId: saved.value.voiceId,
      speechStyle: saved.value.speechStyle,
    });
    this.testFailureSignal.set(null);
    this.storageFailureSignal.set(null);
    this.instructionsAppliedSignal.set(null);
    this.sampleSignal.set(null);
    return true;
  }

  async updatePreset(
    id: string,
    patch: Partial<Pick<TtsPreset, 'voiceId' | 'speechStyle'>>,
  ): Promise<boolean> {
    const current = this.settingsSignal();
    const preset = current.presets.find((item) => item.id === id);
    if (preset === undefined) {
      return false;
    }
    const updated = {
      ...preset,
      voiceId:
        patch.voiceId === undefined
          ? preset.voiceId
          : resolveTtsVoice(preset.modelId, patch.voiceId),
      speechStyle: patch.speechStyle ?? preset.speechStyle,
      lastTestFingerprint: null,
      lastTestedAt: null,
    };
    const saved = await this.repository.updateTtsSettings({
      presets: current.presets.map((item) => (item.id === id ? updated : item)),
      ...(current.activePresetId === id
        ? {
            voiceId: updated.voiceId,
            speechStyle: updated.speechStyle,
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
    this.draftSignal.set({
      modelId: saved.value.modelId,
      voiceId: saved.value.voiceId,
      speechStyle: saved.value.speechStyle,
    });
    return true;
  }

  async save(): Promise<boolean> {
    this.actionSignal.set('saving');
    const saved = await this.persistDraft();
    this.actionSignal.set('idle');
    return saved;
  }

  /** The write itself, without the action state, so a test can reuse it. */
  private async persistDraft(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }
    const draft = this.draftSignal();
    const patch = {
      modelId: draft.modelId.trim(),
      voiceId: resolveTtsVoice(draft.modelId, draft.voiceId),
      speechStyle: draft.speechStyle,
      activePresetId: null,
    };

    const saved = await this.repository.updateTtsSettings(patch);
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.draftSignal.set({
      modelId: saved.value.modelId,
      voiceId: saved.value.voiceId,
      speechStyle: saved.value.speechStyle,
    });
    this.storageFailureSignal.set(null);
    this.testFailureSignal.set(null);
    this.testCancelledSignal.set(false);
    this.instructionsAppliedSignal.set(null);
    this.sampleSignal.set(null);
    return true;
  }

  /**
   * Tries what the model declares it accepts and stores what it honoured.
   *
   * `supportedParameters` comes from the provider catalog, which is fetched
   * lazily and may not be in hand yet; an empty list therefore means "not
   * known", and the instruction channel is attempted so the provider's own
   * refusal — not a missing fetch — is what narrows it.
   */
  async test(supportedParameters: readonly string[] = []): Promise<void> {
    const presetId = this.settingsSignal().activePresetId;
    if (presetId !== null) {
      await this.testPreset(presetId, supportedParameters);
      return;
    }
    // The controller exists before the first await so that cancelling while the
    // draft is still being written stops the attempt rather than being ignored.
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.actionSignal.set('testing');
    this.testFailureSignal.set(null);
    this.testCancelledSignal.set(false);
    this.sampleSignal.set(null);

    const persisted = await this.persistDraft();
    const settings = this.settingsSignal();
    if (
      !persisted ||
      settings.modelId === '' ||
      settings.voiceId === '' ||
      this.controller !== controller
    ) {
      if (this.controller === controller) {
        this.controller = null;
        this.actionSignal.set('idle');
      }
      return;
    }

    const result = await this.provider.testConfiguration(
      {
        modelId: settings.modelId,
        voiceId: settings.voiceId,
        speechStyle: settings.speechStyle,
        attempt: declaredSpeechCapabilities(settings.modelId, supportedParameters),
      },
      controller.signal,
    );

    if (this.controller !== controller) {
      return;
    }
    this.controller = null;
    this.actionSignal.set('idle');

    if (!result.ok) {
      this.testFailureSignal.set(result.error);
      await this.persistTestFailure(result.error, this.fingerprintFor(settings));
      return;
    }

    this.instructionsAppliedSignal.set(result.value.speechInstructionsApplied);
    this.sampleSignal.set(result.value.sample);
    // What the provider honoured, written beside the configuration it was
    // measured for. The fingerprint covers the configuration alone, so storing
    // a finding here cannot make the test that produced it look stale.
    const saved = await this.repository.updateTtsSettings({
      speechInstructions: result.value.speechInstructionsApplied ? 'supported' : 'unsupported',
      failedTests: (this.settingsSignal().failedTests ?? []).filter(
        (test) => test.fingerprint !== this.fingerprintFor(settings),
      ),
      lastTestFingerprint: this.fingerprintFor(settings),
      lastTestedAt: this.clock.now(),
    });
    if (saved.ok) {
      this.settingsSignal.set(saved.value);
      this.storageFailureSignal.set(null);
    } else {
      this.storageFailureSignal.set(saved.error);
    }
  }

  async testPreset(id: string, supportedParameters: readonly string[] = []): Promise<void> {
    const preset = this.settingsSignal().presets.find((item) => item.id === id);
    if (preset === undefined) {
      return;
    }
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.actionSignal.set('testing');
    this.testFailureSignal.set(null);
    this.testCancelledSignal.set(false);
    this.sampleSignal.set(null);
    const result = await this.provider.testConfiguration(
      {
        modelId: preset.modelId,
        voiceId: preset.voiceId,
        speechStyle: preset.speechStyle,
        attempt: declaredSpeechCapabilities(preset.modelId, supportedParameters),
      },
      controller.signal,
    );

    if (this.controller !== controller) {
      return;
    }
    this.controller = null;
    this.actionSignal.set('idle');

    if (!result.ok) {
      this.testFailureSignal.set(result.error);
      await this.persistTestFailure(result.error, this.fingerprintFor(preset));
      return;
    }

    const speechInstructions = result.value.speechInstructionsApplied ? 'supported' : 'unsupported';
    const testedPreset = { ...preset, speechInstructions } as const;
    const fingerprint = this.fingerprintFor(preset);
    const testedAt = this.clock.now();
    const presets = this.settingsSignal().presets.map((item) =>
      item.id === id
        ? { ...testedPreset, lastTestFingerprint: fingerprint, lastTestedAt: testedAt }
        : item,
    );
    const isDefault = this.settingsSignal().activePresetId === id;
    const becomesDefault = this.settingsSignal().activePresetId === null;
    const saved = await this.repository.updateTtsSettings({
      failedTests: (this.settingsSignal().failedTests ?? []).filter(
        (test) => test.fingerprint !== fingerprint,
      ),
      presets,
      ...(isDefault || becomesDefault
        ? {
            activePresetId: id,
            modelId: preset.modelId,
            voiceId: preset.voiceId,
            speechStyle: preset.speechStyle,
            speechInstructions,
            lastTestFingerprint: fingerprint,
            lastTestedAt: testedAt,
          }
        : {}),
    });
    if (saved.ok) {
      this.settingsSignal.set(saved.value);
      this.instructionsAppliedSignal.set(result.value.speechInstructionsApplied);
      this.sampleSignal.set(result.value.sample);
      this.storageFailureSignal.set(null);
    } else {
      this.storageFailureSignal.set(saved.error);
    }
  }

  configForPreset(id: string | null): TtsPreset | null {
    const preset = this.settingsSignal().presets.find((item) => item.id === id);
    return preset !== undefined && this.isPresetReady(preset) ? preset : null;
  }

  /** Stops a test that is still waiting, and says so rather than reporting a failure. */
  private async persistTestFailure(error: AiError, fingerprint: string): Promise<void> {
    this.failureFingerprint.set(fingerprint);
    if (error.code === 'cancelled') return;
    const saved = await this.repository.updateTtsSettings({
      failedTests: recordConfigurationFailure(
        this.settingsSignal().failedTests,
        fingerprint,
        this.clock.now(),
        error,
      ),
    });
    if (saved.ok) this.settingsSignal.set(saved.value);
    else this.storageFailureSignal.set(saved.error);
  }

  cancelTest(): void {
    const wasTesting = this.actionSignal() === 'testing';
    this.controller?.abort();
    this.controller = null;
    this.actionSignal.set('idle');
    if (wasTesting) {
      this.testCancelledSignal.set(true);
    }
  }

  private fingerprintFor(
    settings: Pick<TtsSettings, 'modelId' | 'voiceId' | 'speechStyle'>,
  ): string {
    return ttsFingerprint(this.hasher, this.credential.keyGeneration(), {
      modelId: settings.modelId,
      voiceId: settings.voiceId,
      speechStyle: settings.speechStyle,
    });
  }

  private isPresetReady(preset: TtsPreset): boolean {
    return preset.lastTestFingerprint === this.fingerprintFor(preset);
  }
}
