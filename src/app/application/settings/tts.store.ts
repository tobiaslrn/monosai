import { Injectable, computed, inject, signal } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
import { ttsFingerprint } from '../../domain/ai/configuration-fingerprint';
import { readinessOf, type ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
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
  private readonly storageFailureSignal = signal<StorageError | null>(null);
  private readonly speedAppliedSignal = signal<boolean | null>(null);
  private readonly sampleSignal = signal<Blob | null>(null);

  private controller: AbortController | null = null;

  readonly settings = this.settingsSignal.asReadonly();
  readonly draft = this.draftSignal.asReadonly();
  readonly action = this.actionSignal.asReadonly();
  readonly testFailure = this.testFailureSignal.asReadonly();
  readonly storageFailure = this.storageFailureSignal.asReadonly();
  /** False when the provider ignored the requested speed, so the UI can say so. */
  readonly speedApplied = this.speedAppliedSignal.asReadonly();
  /** The verified clip, played only on an explicit action. */
  readonly sample = this.sampleSignal.asReadonly();

  readonly lastTestedAt = computed(() => this.settingsSignal().lastTestedAt);
  readonly presets = computed(() => this.settingsSignal().presets);
  readonly activePresetId = computed(() => this.settingsSignal().activePresetId);

  readonly hasUnsavedChanges = computed(() => {
    const draft = this.draftSignal();
    const settings = this.settingsSignal();
    return (
      draft.modelId.trim() !== settings.modelId ||
      draft.voiceId.trim() !== settings.voiceId ||
      draft.speed !== settings.speed
    );
  });

  readonly readiness = computed<ConfigurationReadiness>(() => {
    const settings = this.settingsSignal();
    return readinessOf({
      complete: settings.modelId !== '' && settings.voiceId !== '',
      hasCredential: this.credential.isConfigured(),
      savedFingerprint: settings.lastTestFingerprint,
      currentFingerprint: this.fingerprintFor(settings),
      lastAttemptFailed: this.testFailureSignal() !== null,
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
    const presets = [...current.presets.filter((item) => item.id !== preset.id), preset];
    const saved = await this.repository.updateTtsSettings({
      presets,
      activePresetId: preset.id,
      modelId: preset.modelId,
      voiceId: preset.voiceId,
      speed: preset.speed,
      lastTestFingerprint: null,
      lastTestedAt: null,
    });
    if (!saved.ok) {
      this.storageFailureSignal.set(saved.error);
      return false;
    }
    this.settingsSignal.set(saved.value);
    this.draftSignal.set({
      modelId: preset.modelId,
      voiceId: preset.voiceId,
      speed: preset.speed,
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
    const saved = await this.repository.updateTtsSettings({
      presets,
      ...(current.activePresetId === id
        ? {
            activePresetId: replacement?.id ?? null,
            modelId: replacement?.modelId ?? '',
            voiceId: replacement?.voiceId ?? '',
            speed: replacement?.speed ?? DEFAULT_TTS_SETTINGS.speed,
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
    this.sampleSignal.set(null);
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
      speed: clampSpeed(draft.speed),
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
    this.speedAppliedSignal.set(null);
    this.sampleSignal.set(null);
    return true;
  }

  async test(): Promise<void> {
    // The controller exists before the first await so that cancelling while the
    // draft is still being written stops the attempt rather than being ignored.
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.actionSignal.set('testing');
    this.testFailureSignal.set(null);
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
      { modelId: settings.modelId, voiceId: settings.voiceId, speed: settings.speed },
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

    this.speedAppliedSignal.set(result.value.speedApplied);
    this.sampleSignal.set(result.value.sample);
    const saved = await this.repository.updateTtsSettings({
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

  cancelTest(): void {
    this.controller?.abort();
    this.controller = null;
    this.actionSignal.set('idle');
  }

  private fingerprintFor(settings: TtsSettings): string {
    return ttsFingerprint(this.hasher, this.credential.keyGeneration(), {
      modelId: settings.modelId,
      voiceId: settings.voiceId,
      speed: settings.speed,
    });
  }
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) {
    return DEFAULT_TTS_SETTINGS.speed;
  }
  return Math.min(MAX_TTS_SPEED, Math.max(MIN_TTS_SPEED, speed));
}
