import { DOCUMENT } from '@angular/common';
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
import { RouterLink } from '@angular/router';
import { CredentialStore } from '../../application/settings/credential.store';
import { TtsStore } from '../../application/settings/tts.store';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { PageComponent } from '../../shared-ui/layout/layout';
import { ModelPickerComponent } from '../../shared-ui/model-picker/model-picker.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import {
  RadioListComponent,
  type RadioListOption,
} from '../../shared-ui/radio-list/radio-list.component';
import { SectionComponent } from '../../shared-ui/section/section.component';
import {
  SelectComponent,
  type SelectOption,
  type SelectValue,
} from '../../shared-ui/select/select.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import {
  StatusLineComponent,
  type StatusTone,
} from '../../shared-ui/status-line/status-line.component';
import type { AudioStatus } from './ai-status';
import { ModelCatalogView } from './model-catalog-view';
import { audioStatusOf } from './voice-status';

/** What the voice group says about itself under the sample: its tone and its words. */
interface VoiceLine {
  readonly tone: StatusTone;
  readonly text: string;
}

/** The speech model, its voice and delivery, and the sample that vouches for them. */
@Component({
  selector: 'mn-voice-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ModelPickerComponent,
    PageComponent,
    PageHeaderComponent,
    RadioListComponent,
    RouterLink,
    SectionComponent,
    SelectComponent,
    SettingsRowComponent,
    StatusLineComponent,
  ],
  providers: [ModelCatalogView],
  template: `
    <mn-page>
      <mn-page-header heading="Voice" backTo="/settings" backLabel="Back to settings" />

      <mn-section
        label="Speech model and voice"
        [rows]="true"
        data-capability="audio"
        [attr.data-readiness]="tts.readiness()"
      >
        <mn-settings-row label="Model" labelId="mn-audio-model-row-label" end="choice">
          <mn-model-picker
            data-testid="audio-model-picker"
            label="speech models"
            labelledBy="mn-audio-model-row-label"
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

        @if (selectedSpeechModel()?.supportedVoices?.length) {
          <mn-settings-row label="Voice" labelId="mn-voice-label" end="choice">
            <mn-select
              label="Voice"
              labelledBy="mn-voice-label"
              testId="tts-voice-select"
              [options]="voiceOptions()"
              [disabled]="!credential.isConfigured()"
              [value]="tts.draft().voiceId"
              (valueChange)="chooseVoice($event)"
            />
          </mn-settings-row>
        } @else {
          <mn-settings-row label="Voice" labelId="mn-voice-label" end="control">
            <input
              class="mn-control"
              type="text"
              aria-labelledby="mn-voice-label"
              placeholder="Default"
              [disabled]="!credential.isConfigured()"
              [value]="tts.draft().voiceId"
              (change)="setVoice($event)"
            />
          </mn-settings-row>
        }
      </mn-section>

      @if (acceptsDirection()) {
        <mn-section heading="Speaking style" [rows]="true">
          <mn-radio-list
            label="Speaking style"
            testId="tts-style-select"
            [options]="styleOptions"
            [disabled]="!credential.isConfigured()"
            [value]="tts.draft().speechStyle"
            (valueChange)="setSpeechStyle($event)"
          />
        </mn-section>
      }

      <mn-section heading="Pace" [rows]="true">
        <mn-radio-list
          label="Pace"
          testId="tts-pace-select"
          [options]="paceOptions"
          [disabled]="!credential.isConfigured()"
          [value]="tts.draft().speechPace"
          (valueChange)="setSpeechPace($event)"
        />
      </mn-section>

      <mn-section label="Sample" [rows]="true">
        <mn-settings-row
          action="accent"
          [label]="tts.action() === 'testing' ? 'Stop sample' : 'Play sample'"
          [glyph]="tts.action() === 'testing' ? 'stop' : 'play'"
          [testId]="tts.action() === 'testing' ? 'cancel-tts-test' : 'test-tts'"
          [disabled]="
            tts.action() !== 'testing' &&
            (!credential.isConfigured() || tts.draft().modelId === '' || tts.draft().voiceId === '')
          "
          (pressed)="tts.action() === 'testing' ? tts.cancelTest() : testAudio()"
        />
        @if (!credential.isConfigured()) {
          <mn-status-line mn-section-footer tone="warning">
            Needs a key.
            <a mn-status-line-action routerLink="/settings">Open Settings</a>
          </mn-status-line>
        } @else if (line(); as status) {
          <mn-status-line mn-section-footer data-testid="audio-readiness" [tone]="status.tone">
            {{ status.text }}
          </mn-status-line>
        }
      </mn-section>

      <!-- The sample is heard, not operated: it starts itself and leaves no player behind. -->
      @if (tts.sample() !== null) {
        <audio
          #sampleAudio
          class="mn-visually-hidden"
          preload="auto"
          (canplay)="playRequestedSample()"
        ></audio>
      }
    </mn-page>
  `,
})
export class VoicePageComponent {
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
  protected readonly voiceOptions = computed<readonly SelectOption[]>(() =>
    (this.selectedSpeechModel()?.supportedVoices ?? []).map((voice) => ({
      value: voice,
      label: voice,
    })),
  );
  protected readonly styleOptions: readonly RadioListOption[] = [
    { value: 'natural', label: 'Natural', description: 'Everyday articulation' },
    { value: 'clear', label: 'Clear', description: 'Precise sounds, still connected' },
    { value: 'very-clear', label: 'Very clear', description: 'Extra-precise sounds' },
  ];
  protected readonly paceOptions: readonly RadioListOption[] = [
    { value: 'natural', label: 'Natural', description: 'A native speaker’s ordinary rate' },
    { value: 'slow', label: 'Slow', description: 'Slower, for an intermediate learner' },
    { value: 'very-slow', label: 'Very slow', description: 'Much slower, for a beginner' },
  ];
  /** What the catalog says the configured model accepts, empty when unknown. */
  private readonly speechParameters = computed(
    () => this.selectedSpeechModel()?.supportedParameters ?? [],
  );
  protected readonly acceptsDirection = computed(() =>
    this.tts.acceptsDirection(this.speechParameters()),
  );

  /**
   * The one sentence each state owes the learner, under the sample. The
   * unready ones are inside the prose budget: one is about a request that costs
   * money, the other is about audio that has been paid for and looks lost.
   */
  protected readonly line = computed<VoiceLine | null>(() => {
    if (this.tts.settings().modelId === '') {
      return null;
    }
    const status: AudioStatus = audioStatusOf(this.tts);
    switch (status) {
      case 'testing':
        return { tone: 'info', text: 'Playing the sample…' };
      case 'ready':
        return {
          tone: 'success',
          text: 'Ready. This model, voice, style and pace passed their sample.',
        };
      case 'untested':
        return {
          tone: 'warning',
          text: 'Not tested. Audio can be generated once the sample has played through.',
        };
      case 'cancelled':
        return {
          tone: 'warning',
          text: 'Sample stopped. This configuration is still untested.',
        };
      case 'stale':
        return {
          tone: 'warning',
          text: 'Settings changed. Existing audio uses different settings. Generate it again or restore the previous settings.',
        };
      case 'failed': {
        const failure = this.tts.testFailure();
        return {
          tone: 'danger',
          text: failure === null ? 'Test failed.' : `Test failed. ${failure.message}`,
        };
      }
      case 'no-credential':
      case 'incomplete':
        return null;
    }
  });

  constructor() {
    // The sample clip is an object URL, a browser resource tied to the clip it
    // was made from: made when the clip and its element exist, released when
    // either is replaced and when the page is destroyed.
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
  protected chooseVoice(voiceId: SelectValue): void {
    this.tts.setDraft({ voiceId: String(voiceId) });
    void this.tts.save();
  }
  protected setSpeechStyle(value: string): void {
    if (value !== 'natural' && value !== 'clear' && value !== 'very-clear') {
      return;
    }
    this.tts.setDraft({ speechStyle: value });
    void this.tts.save();
  }
  protected setSpeechPace(value: string): void {
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
