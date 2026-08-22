import {
  DOCUMENT,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { MAX_TTS_SPEED, MIN_TTS_SPEED, TtsStore } from '../../application/settings/tts.store';
import { ConfigurationStatusComponent } from './configuration-status.component';

/**
 * The exact TTS model, voice, and speed.
 *
 * Its status is deliberately its own: a voice that does not work says nothing
 * about the text model, and nothing here can block reading or generation. The
 * verified sample plays only when the learner asks for it — audio never starts
 * on its own.
 */
@Component({
  selector: 'mn-tts-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfigurationStatusComponent],
  template: `
    <section class="mn-panel" aria-labelledby="mn-tts-heading">
      <h2 id="mn-tts-heading">Voice (optional)</h2>
      <p class="mn-hint">
        Optional. Reading and story generation work fully without it, and a failure here never
        affects the text model.
      </p>

      <div class="mn-field">
        <label for="mn-tts-model">Exact TTS model ID</label>
        <input
          id="mn-tts-model"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="vendor/model-name"
          data-testid="tts-model-input"
          [value]="tts.draft().modelId"
          (input)="onModelInput($event)"
        />
      </div>

      <div class="mn-field">
        <label for="mn-tts-voice">Exact voice ID</label>
        <input
          id="mn-tts-voice"
          type="text"
          autocomplete="off"
          spellcheck="false"
          data-testid="tts-voice-input"
          [value]="tts.draft().voiceId"
          (input)="onVoiceInput($event)"
        />
      </div>

      <div class="mn-field">
        <label for="mn-tts-speed">Speed</label>
        <input
          id="mn-tts-speed"
          type="range"
          [min]="minSpeed"
          [max]="maxSpeed"
          step="0.05"
          data-testid="tts-speed-input"
          [value]="tts.draft().speed"
          (input)="onSpeedInput($event)"
        />
        <p class="mn-hint">{{ speedLabel() }}</p>
      </div>

      <div class="actions-row">
        <button
          type="button"
          class="mn-button mn-button--primary"
          data-testid="test-tts"
          [disabled]="!canTest()"
          (click)="test()"
        >
          Test voice
        </button>

        @if (tts.action() === 'testing') {
          <button type="button" class="mn-button" data-testid="cancel-tts-test" (click)="cancel()">
            Cancel
          </button>
        } @else if (tts.hasUnsavedChanges()) {
          <button type="button" class="mn-button" data-testid="save-tts" (click)="save()">
            Save
          </button>
        }

        @if (tts.sample(); as sample) {
          <button
            type="button"
            class="mn-button"
            data-testid="play-tts-sample"
            (click)="play(sample)"
          >
            {{ playing() ? 'Stop sample' : 'Play sample' }}
          </button>
        }
      </div>

      @if (tts.action() === 'testing') {
        <p class="mn-hint" role="status">Generating a test phrase…</p>
      } @else {
        <mn-configuration-status
          [readiness]="tts.readiness()"
          [lastTestedAt]="tts.lastTestedAt()"
          [failure]="tts.testFailure()"
        />
      }

      @if (tts.speedApplied() === false) {
        <p class="mn-hint" data-testid="speed-ignored">
          This provider ignored the speed setting. The voice works, but clips play at its own pace.
        </p>
      }

      @if (tts.storageFailure(); as failure) {
        <p role="alert" class="warning">{{ failure.message }}</p>
      }
    </section>
  `,
  styles: `
    .actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .warning {
      margin: 0;
      color: var(--status-danger);
    }
  `,
})
export class TtsSectionComponent {
  private readonly document = inject(DOCUMENT);
  private readonly credential = inject(CredentialStore);
  protected readonly tts = inject(TtsStore);

  protected readonly minSpeed = MIN_TTS_SPEED;
  protected readonly maxSpeed = MAX_TTS_SPEED;

  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;

  protected readonly playing = signal(false);

  protected readonly speedLabel = computed(() => `${this.tts.draft().speed.toFixed(2)}×`);

  protected readonly canTest = computed(
    () =>
      this.tts.action() === 'idle' &&
      this.credential.isConfigured() &&
      this.tts.draft().modelId.trim() !== '' &&
      this.tts.draft().voiceId.trim() !== '',
  );

  constructor() {
    void this.tts.load();
  }

  protected onModelInput(event: Event): void {
    this.tts.setDraft({ modelId: (event.target as HTMLInputElement).value });
  }

  protected onVoiceInput(event: Event): void {
    this.tts.setDraft({ voiceId: (event.target as HTMLInputElement).value });
  }

  protected onSpeedInput(event: Event): void {
    this.tts.setDraft({ speed: Number((event.target as HTMLInputElement).value) });
  }

  protected save(): void {
    this.stop();
    void this.tts.save();
  }

  protected test(): void {
    this.stop();
    void this.tts.test();
  }

  protected cancel(): void {
    this.tts.cancelTest();
  }

  /** Playback starts only from this click, and only for the verified clip. */
  protected play(sample: Blob): void {
    if (this.playing()) {
      this.stop();
      return;
    }
    this.objectUrl = URL.createObjectURL(sample);
    const audio = new (this.document.defaultView?.Audio ?? Audio)(this.objectUrl);
    audio.addEventListener('ended', () => {
      this.stop();
    });
    this.audio = audio;
    this.playing.set(true);
    void audio.play().catch(() => {
      this.stop();
    });
  }

  private stop(): void {
    this.audio?.pause();
    this.audio = null;
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.playing.set(false);
  }
}
