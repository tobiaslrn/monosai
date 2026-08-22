import { Dialog } from '@angular/cdk/dialog';
import {
  DOCUMENT,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TtsStore } from '../../application/settings/tts.store';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { openAddModelDialog } from './add-model-dialog.component';
import { ConfigurationStatusComponent } from './configuration-status.component';

/** The active registered TTS preset, with an independent compatibility test. */
@Component({
  selector: 'mn-tts-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfigurationStatusComponent],
  template: `
    <section class="mn-panel" aria-labelledby="mn-tts-heading">
      <div class="section-heading">
        <div>
          <h2 id="mn-tts-heading">Voice (optional)</h2>
          <p class="mn-hint">
            Reading and story generation work fully without it. A voice failure never affects the
            text model.
          </p>
        </div>
        <button
          type="button"
          class="mn-button"
          data-testid="add-tts-model"
          [disabled]="!credential.isConfigured()"
          (click)="addModel()"
        >
          Add model
        </button>
      </div>

      @if (tts.presets().length > 0) {
        <div class="preset-picker">
          <div class="mn-field">
            <label for="mn-tts-preset">Active voice model</label>
            <select
              id="mn-tts-preset"
              data-testid="tts-preset-select"
              [value]="tts.activePresetId() ?? ''"
              (change)="selectPreset($event)"
            >
              <option value="" disabled>Choose a voice model</option>
              @for (preset of tts.presets(); track preset.id) {
                <option [value]="preset.id">{{ preset.name }}</option>
              }
            </select>
          </div>
          <button
            type="button"
            class="mn-button remove-model"
            data-testid="remove-tts-model"
            [disabled]="activePreset() === null"
            (click)="removeActiveModel()"
          >
            Remove
          </button>
        </div>
      } @else {
        <div class="empty-state">
          <span aria-hidden="true">♫</span>
          <div>
            <strong>No registered voice models</strong>
            <p>Add one if you want Monosai to read generated Japanese aloud.</p>
          </div>
        </div>
      }

      @if (activePreset(); as preset) {
        <div class="preset-summary">
          <div>
            <span>Model ID</span><strong>{{ preset.modelId }}</strong>
          </div>
          <div>
            <span>Voice</span><strong>{{ preset.voiceId }}</strong>
          </div>
          <div>
            <span>Speed</span><strong>{{ preset.speed.toFixed(2) }}×</strong>
          </div>
        </div>
      } @else if (tts.settings().modelId !== '') {
        <p class="mn-hint">Current unregistered model: {{ tts.settings().modelId }}</p>
      }

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
    .section-heading,
    .actions-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .section-heading h2,
    .empty-state p {
      margin: 0;
    }
    .actions-row {
      justify-content: flex-start;
    }

    .preset-picker {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
      gap: var(--space-2);
    }

    .remove-model {
      color: var(--status-danger);
    }

    .empty-state {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
    }

    .empty-state > span {
      display: grid;
      width: 2.5rem;
      height: 2.5rem;
      place-items: center;
      border-radius: 50%;
      background: var(--accent-secondary-soft);
      color: var(--accent-secondary);
      font-size: 1.2rem;
    }

    .empty-state p,
    .preset-summary span {
      color: var(--text-secondary);
    }

    .preset-summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: var(--space-3);
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
    }

    .preset-summary div {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: var(--space-1);
    }
    .preset-summary span {
      font-size: var(--text-sm);
    }
    .preset-summary strong {
      overflow-wrap: anywhere;
    }
    .warning {
      margin: 0;
      color: var(--status-danger);
    }

    @media (max-width: 32rem) {
      .section-heading {
        align-items: stretch;
        flex-direction: column;
      }
      .preset-picker {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .preset-summary {
        grid-template-columns: 1fr 1fr;
      }
      .preset-summary div:first-child {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class TtsSectionComponent {
  private readonly document = inject(DOCUMENT);
  private readonly dialog = inject(Dialog);
  protected readonly credential = inject(CredentialStore);
  protected readonly tts = inject(TtsStore);
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  protected readonly playing = signal(false);

  protected readonly activePreset = computed(() => {
    const activeId = this.tts.activePresetId();
    return this.tts.presets().find((preset) => preset.id === activeId) ?? null;
  });
  protected readonly canTest = computed(
    () =>
      this.tts.action() === 'idle' &&
      this.credential.isConfigured() &&
      this.tts.settings().modelId !== '' &&
      this.tts.settings().voiceId !== '',
  );

  constructor() {
    void this.tts.load();
  }

  protected async addModel(): Promise<void> {
    const result = await openAddModelDialog(this.dialog, { kind: 'tts' });
    if (result?.kind === 'tts') {
      await this.tts.registerPreset(result.preset);
    }
  }

  protected selectPreset(event: Event): void {
    this.stop();
    void this.tts.selectPreset((event.target as HTMLSelectElement).value);
  }

  protected async removeActiveModel(): Promise<void> {
    const preset = this.activePreset();
    if (preset === null) {
      return;
    }
    const confirmed = await openConfirmDialog(this.dialog, {
      title: `Remove ${preset.name}?`,
      message: 'This removes the registered voice preset from this device.',
      details: [
        `${preset.modelId} · ${preset.voiceId}`,
        'Your readings and saved audio stay untouched.',
      ],
      footnote: 'If another voice becomes active, test it before synthesis.',
      confirmLabel: 'Remove voice',
      cancelLabel: 'Keep voice',
      tone: 'danger',
    });
    if (confirmed) {
      this.stop();
      await this.tts.removePreset(preset.id);
    }
  }

  protected test(): void {
    this.stop();
    void this.tts.test();
  }

  protected cancel(): void {
    this.tts.cancelTest();
  }

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
