import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TtsStore } from '../../application/settings/tts.store';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { ModelCatalogView } from './model-catalog-view';
import { ModelPickerComponent } from './model-picker.component';

/**
 * Every state the audio configuration can be in, as one surface has to say it.
 *
 * Readiness plus the two states a test itself is in, so nothing on screen has
 * to combine three signals to answer "can this read to me yet".
 */
export type AudioStatus = ConfigurationReadiness | 'testing' | 'cancelled';

/** The speech model, its voice and delivery, and the preview that vouches for them. */
@Component({
  selector: 'mn-voice-model',
  host: {
    class: 'node mn-inset mn-settings-group',
    role: 'region',
    'aria-labelledby': 'mn-audio-model-label',
    'data-capability': 'audio',
    '[attr.data-readiness]': 'tts.readiness()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ModelPickerComponent, SettingsRowComponent],
  template: `
    <div class="mn-settings-group__header">
      <h3 class="mn-group-title" id="mn-audio-model-label">Voice</h3>
      <div class="head-status mn-actions">
        <span
          class="mn-status-pill"
          [class.mn-status-pill--success]="tts.readiness() === 'ready'"
          [class.mn-status-pill--danger]="audioStatus() === 'failed'"
          data-testid="audio-readiness"
          [title]="audioStatusTitle()"
          >{{ audioStatusLabel() }}</span
        >
        @if (tts.action() === 'testing') {
          <button
            type="button"
            class="mn-button mn-button--ghost"
            data-testid="cancel-tts-test"
            (click)="tts.cancelTest()"
          >
            Stop
          </button>
        } @else {
          <button
            type="button"
            class="mn-button mn-button--ghost"
            data-testid="test-tts"
            [disabled]="tts.draft().modelId === '' || tts.draft().voiceId === ''"
            (click)="testAudio()"
          >
            Preview
          </button>
        }
      </div>
    </div>

    <mn-settings-row label="Model">
      <mn-model-picker
        [compact]="true"
        data-testid="audio-model-picker"
        label="speech models"
        [speech]="true"
        [models]="speechModels()"
        [favoriteIds]="tts.favoriteModelIds()"
        [selectedId]="tts.settings().modelId"
        [selectedLabel]="speechModelLabel()"
        [loading]="catalogLoading()"
        [failure]="catalogFailure()"
        [disabled]="!credential.isConfigured()"
        (opened)="retryCatalog()"
        (modelSelected)="selectSpeechModel($event)"
        (favoriteToggled)="tts.toggleFavorite($event)"
      />
    </mn-settings-row>

    <mn-settings-row label="Voice ID" labelId="mn-voice-label">
      @if (selectedSpeechModel()?.supportedVoices?.length) {
        <select
          class="mn-control"
          aria-label="Voice"
          aria-labelledby="mn-voice-label"
          [disabled]="!credential.isConfigured()"
          [ngModel]="tts.draft().voiceId"
          (change)="setVoice($event)"
        >
          @for (voice of selectedSpeechModel()?.supportedVoices ?? []; track voice) {
            <option [value]="voice">{{ voice }}</option>
          }
        </select>
      } @else {
        <input
          class="mn-control"
          type="text"
          aria-label="Voice"
          aria-labelledby="mn-voice-label"
          placeholder="Default"
          [disabled]="!credential.isConfigured()"
          [value]="tts.draft().voiceId"
          (change)="setVoice($event)"
        />
      }
    </mn-settings-row>

    @if (acceptsDirection()) {
      <mn-settings-row label="Speaking style" labelId="mn-style-label">
        <select
          class="mn-control"
          data-testid="tts-style-select"
          aria-labelledby="mn-style-label"
          [disabled]="!credential.isConfigured()"
          [ngModel]="tts.draft().speechStyle"
          (change)="setSpeechStyle($event)"
        >
          <option value="natural">Natural</option>
          <option value="clear">Clear</option>
          <option value="very-clear">Very clear</option>
        </select>
      </mn-settings-row>
    }

    <mn-settings-row label="Pace" labelId="mn-pace-label">
      <select
        class="mn-control"
        data-testid="tts-pace-select"
        aria-labelledby="mn-pace-label"
        [disabled]="!credential.isConfigured()"
        [ngModel]="tts.draft().speechPace"
        (change)="setSpeechPace($event)"
      >
        <option value="natural">Natural</option>
        <option value="slow">Slow</option>
        <option value="very-slow">Very slow</option>
      </select>
    </mn-settings-row>

    @if (audioReadinessNote(); as note) {
      <p class="mn-settings-feedback" data-testid="audio-readiness-note">{{ note }}</p>
    }

    <!-- The preview is heard, not operated: it starts itself and leaves no player behind. -->
    @if (tts.sample() !== null) {
      <audio
        #sampleAudio
        class="mn-visually-hidden"
        preload="auto"
        (canplay)="playRequestedSample()"
      ></audio>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    h3,
    p {
      margin: 0;
    }
    .head-status {
      flex: 0 1 auto;
      justify-content: flex-end;
      flex-wrap: nowrap;
    }
  `,
})
export class VoiceModelComponent {
  private readonly catalog = inject(ModelCatalogView);
  private readonly document = inject(DOCUMENT);
  protected readonly credential = inject(CredentialStore);
  protected readonly tts = inject(TtsStore);
  protected readonly speechModels = this.catalog.speechModels;
  protected readonly catalogLoading = this.catalog.loading;
  protected readonly catalogFailure = this.catalog.failure;
  /**
   * The clip that has already played, or been shown without playing: a sample
   * already present when Settings opens is display-only, so it starts as played.
   */
  private readonly playedSample = signal<Blob | null>(untracked(this.tts.sample));
  private readonly sampleAudio = viewChild<ElementRef<HTMLAudioElement>>('sampleAudio');

  protected readonly selectedSpeechModel = computed(
    () => this.speechModels().find((model) => model.modelId === this.tts.draft().modelId) ?? null,
  );
  protected readonly speechModelLabel = computed(
    () =>
      this.tts.presets().find((preset) => preset.id === this.tts.settings().activePresetId)?.name ??
      null,
  );
  /** What the catalog says the configured model accepts, empty when unknown. */
  private readonly speechParameters = computed(
    () => this.selectedSpeechModel()?.supportedParameters ?? [],
  );
  protected readonly acceptsDirection = computed(() =>
    this.tts.acceptsDirection(this.speechParameters()),
  );
  /**
   * Where the speech configuration stands, in one value the head can render.
   *
   * `testing` and `cancelled` are not readiness — a running test proves nothing
   * yet, and a stopped one proves nothing ever — but they are two of the six
   * states a learner has to be able to tell apart, so they are resolved here
   * rather than each being inferred from a different signal at the template.
   */
  protected readonly audioStatus = computed<AudioStatus>(() => {
    if (this.tts.action() === 'testing') {
      return 'testing';
    }
    const readiness = this.tts.readiness();
    if (this.tts.testCancelled() && readiness !== 'ready') {
      return 'cancelled';
    }
    return readiness;
  });

  protected readonly audioStatusLabel = computed(
    () =>
      ({
        testing: 'Playing…',
        cancelled: 'Stopped',
        ready: 'Ready',
        untested: 'Not tested',
        stale: 'Settings changed',
        failed: 'Failed',
        'no-credential': 'No key',
        incomplete: 'No model',
      })[this.audioStatus()],
  );

  protected readonly audioStatusTitle = computed(
    () =>
      ({
        testing: 'Playing a test clip from this model.',
        cancelled: 'You stopped the preview, so this configuration is still untested.',
        ready: 'This model, voice, style and pace passed their preview.',
        untested: 'Preview this model before generating audio.',
        stale: 'The model, voice, style or pace changed since the last preview.',
        failed: 'The last preview failed.',
        'no-credential': 'Add an OpenRouter key.',
        incomplete: 'Choose a speech model and a voice.',
      })[this.audioStatus()],
  );

  /**
   * The one sentence each unready state owes the learner.
   *
   * Both are inside the prose budget: one is about a request that costs money,
   * the other is about audio that has been paid for and looks lost.
   */
  protected readonly audioReadinessNote = computed(() => {
    if (!this.credential.isConfigured() || this.tts.settings().modelId === '') {
      return null;
    }
    switch (this.audioStatus()) {
      case 'untested':
        return 'Preview plays one test sentence. Audio can only be generated once it has passed.';
      case 'cancelled':
        return 'The preview was stopped, so this configuration is still untested.';
      case 'stale':
        return 'Existing audio uses different settings. Generate it again or restore the previous settings.';
      case 'testing':
      case 'ready':
      case 'failed':
      case 'no-credential':
      case 'incomplete':
        return null;
    }
  });

  constructor() {
    // The preview clip is an object URL, a browser resource tied to the clip it
    // was made from: made when the clip and its element exist, released when
    // either is replaced and when the panel is destroyed.
    effect((onCleanup) => {
      const sample = this.tts.sample();
      const audio = this.sampleAudio()?.nativeElement;
      const view = this.document.defaultView;
      if (sample === null || audio === undefined || view === null) return;
      const url = view.URL.createObjectURL(sample);
      audio.src = url;
      onCleanup(() => {
        view.URL.revokeObjectURL(url);
      });
    });
  }

  protected playRequestedSample(): void {
    const sample = this.tts.sample();
    if (sample === null || sample === this.playedSample()) return;
    this.playedSample.set(sample);
    this.playSample();
  }
  protected retryCatalog(): void {
    this.catalog.retry();
  }
  protected async selectSpeechModel(model: ModelCapabilities): Promise<void> {
    this.tts.setDraft({ modelId: model.modelId, voiceId: model.supportedVoices[0] ?? '' });
    await this.tts.save();
  }
  protected setVoice(event: Event): void {
    this.tts.setDraft({ voiceId: (event.target as HTMLInputElement).value });
    void this.tts.save();
  }
  protected setSpeechStyle(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== 'natural' && value !== 'clear' && value !== 'very-clear') {
      return;
    }
    this.tts.setDraft({ speechStyle: value });
    void this.tts.save();
  }
  protected setSpeechPace(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== 'natural' && value !== 'slow' && value !== 'very-slow') {
      return;
    }
    this.tts.setDraft({ speechPace: value });
    void this.tts.save();
  }
  protected testAudio(): void {
    void this.tts.test(this.speechParameters());
  }
  private playSample(): void {
    const audio = this.sampleAudio()?.nativeElement;
    if (audio === undefined) return;
    audio.preservesPitch = true;
    audio.playbackRate = 1;
    audio.defaultPlaybackRate = 1;
    void audio.play().catch(() => undefined);
  }
}
