import {
  DOCUMENT,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import { StorageStore } from '../../application/settings/storage.store';

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'Not reported by this browser';
  }
  const units = ['B', 'kB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Browser storage protection, cache clearing, and the danger zone.
 *
 * A full reset requires two explicit confirmations and only then deletes local
 * data before reloading into the first-use state.
 */
@Component({
  selector: 'mn-storage-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mn-panel" aria-labelledby="mn-storage-heading">
      <h2 id="mn-storage-heading">Storage</h2>

      <dl>
        <div>
          <dt>Browser storage protection</dt>
          <dd>{{ persistenceLabel() }}</dd>
        </div>
        <div>
          <dt>Approximate usage</dt>
          <dd>{{ usageLabel() }}</dd>
        </div>
      </dl>

      <div class="actions-row">
        @if (storage.status().canRequest) {
          <button
            type="button"
            class="mn-button"
            [disabled]="storage.action() !== 'idle'"
            (click)="requestPersistence()"
          >
            Ask the browser to keep Monosai data
          </button>
        }
        <button
          type="button"
          class="mn-button"
          [disabled]="storage.action() !== 'idle'"
          (click)="clearAudio()"
        >
          Clear audio cache
        </button>
      </div>
      <p class="mn-hint">
        Clearing audio leaves readings, translations, and grammar results in place. Playback stops
        first if necessary.
      </p>
      <p aria-live="polite" class="mn-hint">
        @if (storage.audioCleared()) {
          Audio cache cleared{{ stoppedPlayback() ? ', and playback stopped' : '' }}.
        }
      </p>

      <details class="danger mn-disclosure" data-testid="danger-zone">
        <summary>Danger zone</summary>
        <div class="danger-content">
          <p class="mn-hint">
            A full reset permanently deletes every reading, snapshot, saved setting, and cached aid
            on this device. It cannot be undone.
          </p>

          @if (resetStage() === 'idle') {
            <button type="button" class="mn-button mn-button--danger" (click)="beginReset()">
              Delete all Monosai data
            </button>
          } @else {
            <p role="alert" class="confirm">
              This deletes everything Monosai has stored in this browser. Continue?
            </p>
            <div class="actions-row">
              <button
                type="button"
                class="mn-button mn-button--danger"
                [disabled]="storage.action() === 'resetting'"
                (click)="confirmReset()"
              >
                Yes, delete everything
              </button>
              <button type="button" class="mn-button" (click)="cancelReset()">Cancel</button>
            </div>
          }
        </div>
      </details>

      @if (storage.failure(); as failure) {
        <p role="alert" class="failure">{{ failure.message }}</p>
      }
    </section>
  `,
  styles: `
    dl {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
    }

    dl div {
      display: grid;
      grid-template-columns: minmax(12rem, 20rem) minmax(0, 1fr);
      gap: var(--space-2);
      align-items: baseline;
    }

    dt {
      color: var(--text-secondary);
    }

    dd {
      margin: 0;
    }

    .danger {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      align-items: flex-start;
    }

    .danger {
      padding-top: var(--space-4);
      border-top: 1px solid var(--border-subtle);
    }

    .danger summary {
      color: var(--status-danger);
    }

    .danger-content {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      align-items: flex-start;
      padding-top: var(--space-2);
    }

    .actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    @media (max-width: 36rem) {
      dl div {
        grid-template-columns: 1fr;
        gap: var(--space-1);
      }
    }

    .confirm,
    .failure {
      color: var(--status-danger);
    }
  `,
})
export class StorageSectionComponent {
  private readonly document = inject(DOCUMENT);
  private readonly playback = inject(AudioPlaybackStore);
  protected readonly storage = inject(StorageStore);
  protected readonly resetStage = signal<'idle' | 'confirming'>('idle');
  /** Whether the clear that just ran also had to stop something playing. */
  protected readonly stoppedPlayback = signal(false);

  protected readonly persistenceLabel = computed(() =>
    this.storage.status().persisted
      ? 'Granted — the browser keeps Monosai data'
      : 'Not granted — the browser may evict data when space runs low',
  );

  protected readonly usageLabel = computed(() => formatBytes(this.storage.status().usageBytes));

  constructor() {
    void this.storage.refresh();
  }

  protected requestPersistence(): void {
    void this.storage.requestPersistence();
  }

  /**
   * Clears the audio cache, having first stopped anything playing from it.
   *
   * The order matters and is the point: reporting an empty cache while a clip
   * out of it is still audible would be a report the learner can hear is false.
   */
  protected clearAudio(): void {
    this.stoppedPlayback.set(this.playback.isActive());
    this.playback.audioCacheCleared();
    void this.storage.clearAudioCache();
  }

  protected beginReset(): void {
    this.resetStage.set('confirming');
  }

  protected cancelReset(): void {
    this.resetStage.set('idle');
  }

  protected confirmReset(): void {
    void this.storage.resetAllData().then((succeeded) => {
      this.resetStage.set('idle');
      if (succeeded) {
        this.document.defaultView?.location.reload();
      }
    });
  }
}
