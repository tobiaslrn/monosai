import {
  configurationTestFailure,
  recordConfigurationFailure,
} from '../../domain/ai/failed-configuration-test';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import { ttsFingerprint } from '../../domain/ai/configuration-fingerprint';
import { readinessOf, type ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import { declaredSpeechCapabilities, type PaceControl } from '../../domain/ai/speech-capabilities';
import { resolveTtsVoice } from '../../domain/ai/tts-configuration';
import {
  DEFAULT_TTS_SETTINGS,
  type TtsPreset,
  type TtsSettings,
} from '../../domain/settings/settings';
import type { StorageError } from '../../domain/storage/storage-error';
import { TEXT_TO_SPEECH_PROVIDER } from '../shared/ai-tokens';
import { CLOCK, HASHER, SETTINGS_REPOSITORY } from '../shared/repository-tokens';
import { CredentialStore } from './credential.store';

export type TtsAction = 'idle' | 'saving' | 'testing';

export interface TtsDraft {
  readonly modelId: string;
  readonly voiceId: string;
  readonly speed: number;
}

/** Bounds of the speed control, matching what synthesis providers accept. */
export const MIN_TTS_SPEED = 0.5;
export const MAX_TTS_SPEED = 2;

/**
 * Whether a typed speed is a value that may be committed.
 *
 * An empty or half-written field is *incomplete input*, not a request for the
 * minimum: clearing the box to retype used to store 0.5 and leave a learner
 * with permanent half-speed narration.
 */
export function isValidTtsSpeed(speed: number): boolean {
  return Number.isFinite(speed) && speed >= MIN_TTS_SPEED && speed <= MAX_TTS_SPEED;
}

/**
 * The exact TTS model, voice, and speed, with their own test.
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
    speed: DEFAULT_TTS_SETTINGS.speed,
  });
  private readonly actionSignal = signal<TtsAction>('idle');
  private readonly testFailureSignal = signal<AiError | null>(null);
  private readonly failureFingerprint = signal<string | null>(null);
  private readonly storageFailureSignal = signal<StorageError | null>(null);
  private readonly speedAppliedSignal = signal<boolean | null>(null);
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
  /** False when the provider ignored the requested speed, so the UI can say so. */
  readonly speedApplied = this.speedAppliedSignal.asReadonly();
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
   * Which channel the saved speed actually travels through.
   *
   * Read from what the last test measured, not from a catalog, so it survives a
   * reload and an offline session. Monosai never slows a clip locally, so
   * `fixed` means the setting genuinely cannot reach this model.
   */
  readonly paceSource = computed<PaceControl>(() => {
    const settings = this.settingsSignal();
    if (settings.speedSupported) return 'native';
    return settings.speechInstructions === 'supported' ? 'prompted' : 'fixed';
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
      // An unusable speed is not a change waiting to be saved. Treating it as
      // one made every emptied field a write of some other number.
      (isValidTtsSpeed(draft.speed) && draft.speed !== settings.speed)
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
      speed: settings.value.speed,
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
      speedSupported: preset.speedSupported ?? false,
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
            speed: preset.speed,
            speedSupported: registered.speedSupported ?? false,
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
      speed: saved.value.speed,
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
      speed: preset.speed,
      speedSupported: preset.speedSupported ?? false,
      speechInstructions: preset.speechInstructions ?? 'unsupported',
      lastTestFingerprint: preset.lastTestFingerprint ?? null,
      lastTestedAt: preset.lastTestedAt ?? null,
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.draftSignal.set({ modelId: preset.modelId, voiceId: preset.voiceId, speed: preset.speed });
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
            speed: DEFAULT_TTS_SETTINGS.speed,
            speedSupported: DEFAULT_TTS_SETTINGS.speedSupported,
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
      speed: saved.value.speed,
    });
    this.testFailureSignal.set(null);
    this.storageFailureSignal.set(null);
    this.speedAppliedSignal.set(null);
    this.instructionsAppliedSignal.set(null);
    this.sampleSignal.set(null);
    return true;
  }

  async updatePreset(
    id: string,
    patch: Partial<Pick<TtsPreset, 'voiceId' | 'speed'>>,
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
      speed: patch.speed === undefined ? preset.speed : clampSpeed(patch.speed),
      lastTestFingerprint: null,
      lastTestedAt: null,
    };
    const saved = await this.repository.updateTtsSettings({
      presets: current.presets.map((item) => (item.id === id ? updated : item)),
      ...(current.activePresetId === id
        ? {
            voiceId: updated.voiceId,
            speed: updated.speed,
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
      speed: saved.value.speed,
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
      speed: this.speedToPersist(draft.speed),
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
      speed: saved.value.speed,
    });
    this.storageFailureSignal.set(null);
    this.testFailureSignal.set(null);
    this.testCancelledSignal.set(false);
    this.speedAppliedSignal.set(null);
    this.instructionsAppliedSignal.set(null);
    this.sampleSignal.set(null);
    return true;
  }

  /**
   * Tries what the model declares it accepts and stores what it honoured.
   *
   * `supportedParameters` comes from the provider catalog, which is fetched
   * lazily and may not be in hand yet; an empty list therefore means "not
   * known", and both channels are attempted so the provider's own refusal — not
   * a missing fetch — is what narrows them.
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
        speed: settings.speed,
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

    this.speedAppliedSignal.set(result.value.speedApplied);
    this.instructionsAppliedSignal.set(result.value.speechInstructionsApplied);
    this.sampleSignal.set(result.value.sample);
    // What the provider honoured, written beside the configuration it was
    // measured for. The fingerprint covers the configuration alone, so storing
    // a finding here cannot make the test that produced it look stale.
    const saved = await this.repository.updateTtsSettings({
      speedSupported: result.value.speedApplied,
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
        speed: preset.speed,
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

    const speedSupported = result.value.speedApplied;
    const speechInstructions = result.value.speechInstructionsApplied ? 'supported' : 'unsupported';
    const testedPreset = { ...preset, speedSupported, speechInstructions } as const;
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
            speed: preset.speed,
            speedSupported,
            speechInstructions,
            lastTestFingerprint: fingerprint,
            lastTestedAt: testedAt,
          }
        : {}),
    });
    if (saved.ok) {
      this.settingsSignal.set(saved.value);
      this.speedAppliedSignal.set(result.value.speedApplied);
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

  /**
   * What a save should write for the speed the field currently holds.
   *
   * A value outside the bounds is clamped, because a number was meant; a value
   * that is not a number at all leaves the saved speed alone, because nothing
   * was meant yet.
   */
  private speedToPersist(draftSpeed: number): number {
    if (!Number.isFinite(draftSpeed)) {
      return this.settingsSignal().speed;
    }
    return clampSpeed(draftSpeed);
  }

  private fingerprintFor(settings: Pick<TtsSettings, 'modelId' | 'voiceId' | 'speed'>): string {
    return ttsFingerprint(this.hasher, this.credential.keyGeneration(), {
      modelId: settings.modelId,
      voiceId: settings.voiceId,
      speed: settings.speed,
    });
  }

  private isPresetReady(preset: TtsPreset): boolean {
    return preset.lastTestFingerprint === this.fingerprintFor(preset);
  }
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) {
    return DEFAULT_TTS_SETTINGS.speed;
  }
  return Math.min(MAX_TTS_SPEED, Math.max(MIN_TTS_SPEED, speed));
}
