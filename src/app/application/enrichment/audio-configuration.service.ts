import { Injectable, inject } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import {
  audioConfigFingerprint,
  audioOptionsFingerprint,
} from '../../domain/enrichment/cache-keys';
import { err, ok, type Result } from '../../domain/shared/result';
import { HASHER } from '../shared/repository-tokens';
import { TtsStore } from '../settings/tts.store';
import type { AudioSynthesisConfig } from './audio-synthesis.service';

/** MP3 is what synthesis asks for and what the audio cache stores. */
const RESPONSE_FORMAT = 'mp3';

export interface ResolvedAudioConfig extends AudioSynthesisConfig {
  /**
   * The per-sentence-independent fingerprint a persisted job is compared
   * against, so a job whose voice or speed has since changed is closed rather
   * than continued under a number that would mean two configurations at once.
   */
  readonly configFingerprint: string;
}

/**
 * The one place the current TTS configuration becomes a synthesis config.
 *
 * Both the sentence action and the whole-reading job need the same three
 * answers — is the configuration tested and current, what are the model, voice,
 * and speed, and what do the two fingerprints hash to — and two copies of that
 * would be two chances to disagree about whether a stale test may spend money.
 */
@Injectable({ providedIn: 'root' })
export class AudioConfigurationService {
  private readonly tts = inject(TtsStore);
  private readonly hasher = inject(HASHER);

  /**
   * Refuses unless the exact saved configuration has passed its own test.
   *
   * `ai-pipelines.md` section 11 step 1 requires a tested current configuration
   * before anything is synthesized: an untested or stale one would spend money
   * to discover what the test exists to find out for the price of one sentence.
   */
  resolve(task: AiTask): Result<ResolvedAudioConfig, AiError> {
    const settings = this.tts.settings();
    const configurable = this.tts as Partial<Pick<TtsStore, 'configForPreset'>>;
    const preset = configurable.configForPreset?.(settings.activePresetId) ?? null;
    if (preset === null && this.tts.readiness() !== 'ready') {
      const readiness = this.tts.readiness();
      return err(
        aiError(
          'capability-unsupported',
          task,
          readiness === 'not-configured'
            ? 'No text-to-speech model and voice are set up.'
            : 'The saved text-to-speech configuration has not passed its test as it stands.',
          { detail: { capability: 'text-to-speech' } },
        ),
      );
    }

    const selected = preset ?? settings;
    const optionsFingerprint = audioOptionsFingerprint(this.hasher, {
      responseFormat: RESPONSE_FORMAT,
      speed: selected.speed,
      speechInstructions: selected.speechInstructions ?? 'unsupported',
    });
    return ok({
      modelId: selected.modelId,
      voiceId: selected.voiceId,
      speed: selected.speed,
      speechInstructions: selected.speechInstructions ?? 'unsupported',
      optionsFingerprint,
      configFingerprint: audioConfigFingerprint(
        this.hasher,
        selected.modelId,
        selected.voiceId,
        optionsFingerprint,
      ),
    });
  }
}
