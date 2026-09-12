import {
  DOCUMENT,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import { AudioCompressionStore } from '../../application/settings/audio-compression.store';
import { StorageStore } from '../../application/settings/storage.store';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';

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
    <section class="mn-card" aria-labelledby="mn-storage-heading">
      <div class="mn-stack">
        <h2 id="mn-storage-heading" class="mn-card-title">Storage</h2>

        <dl class="mn-facts">
          <div>
            <dt>Browser storage protection</dt>
            <!--
              A live region because the answer to the request below appears here
              and nowhere else; a refusal changed nothing on screen before.
            -->
            <dd aria-live="polite">{{ persistenceLabel() }}</dd>
          </div>
          <div>
            <dt>Approximate usage</dt>
            <dd>{{ usageLabel() }}</dd>
          </div>
          @if (compressionLabel(); as label) {
            <div>
              <dt>Saved audio</dt>
              <!--
                Live, because this is the one thing on the card that changes
                without the learner having touched anything.
              -->
              <dd aria-live="polite">{{ label }}</dd>
            </div>
          }
        </dl>

        <div class="mn-actions">
          @if (storage.status().canRequest) {
            <button
              type="button"
              class="mn-button"
              [disabled]="storage.action() !== 'idle'"
              (click)="requestPersistence()"
            >
              Keep data
            </button>
          }
          <button
            type="button"
            class="mn-button"
            [disabled]="storage.action() !== 'idle'"
            (click)="clearAudio()"
          >
            Delete saved audio
          </button>
          @if (compression.running()) {
            <button type="button" class="mn-button" (click)="stopCompressing()">Stop</button>
          }
        </div>
        <p aria-live="polite" class="mn-hint">
          @if (storage.audioCleared()) {
            Saved audio deleted{{ stoppedPlayback() ? ', and playback stopped' : '' }}.
          }
        </p>

        <details class="danger mn-disclosure" data-testid="danger-zone">
          <summary>Danger zone</summary>
          <div class="danger-content mn-stack mn-stack--tight">
            <p class="mn-hint">
              A full reset permanently deletes every reading, snapshot, saved setting, and cached
              aid on this device. It cannot be undone.
            </p>

            @if (resetStage() === 'idle') {
              <button type="button" class="mn-button mn-button--danger" (click)="beginReset()">
                Delete all Monosai data
              </button>
            } @else {
              <p role="alert" class="mn-notice mn-notice--error">
                This deletes everything Monosai has stored in this browser. Continue?
              </p>
              <div class="mn-actions">
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
          <p role="alert" class="mn-notice mn-notice--error">{{ failure.message }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    p {
      margin: 0;
    }

    .danger {
      padding-top: var(--space-2);
      border-top: 1px solid var(--border-subtle);
    }

    .danger summary {
      color: var(--status-danger);
    }

    .danger-content {
      align-items: flex-start;
      padding-top: var(--space-2);
    }
  `,
})
export class StorageSectionComponent {
  private readonly document = inject(DOCUMENT);
  private readonly dialog = inject(Dialog);
  private readonly playback = inject(AudioPlaybackStore);
  protected readonly storage = inject(StorageStore);
  protected readonly compression = inject(AudioCompressionStore);
  protected readonly resetStage = signal<'idle' | 'confirming'>('idle');
  /** Whether the clear that just ran also had to stop something playing. */
  protected readonly stoppedPlayback = signal(false);

  /** The compact status for the browser's current storage-protection answer. */
  protected readonly persistenceLabel = computed(() => {
    switch (this.storage.persistence()) {
      case 'granted':
        return 'Protected';
      case 'unsupported':
        return 'Protection unavailable';
      case 'refused':
        return 'Not protected';
      case 'request-failed':
        return 'Not protected';
      case 'not-asked':
        return 'Not protected';
      case 'unknown':
        return 'Protection status unknown';
    }
  });

  protected readonly usageLabel = computed(() => formatBytes(this.storage.status().usageBytes));

  /**
   * What the background compression pass has to say, or `null` when it has
   * nothing to report.
   *
   * A real count rather than a percentage, and the finished sentence names what
   * was left alone as well as what was compressed: a clip this could not
   * re-encode is still there and still playable, which is the part worth
   * stating.
   */
  protected readonly compressionLabel = computed(() => {
    const state = this.compression.state();
    switch (state.kind) {
      case 'idle':
        return null;
      case 'running':
        return `Compressing ${String(state.done + 1)} of ${String(state.total)}`;
      case 'finished': {
        if (state.compressed === 0 && state.skipped === 0) {
          return null;
        }
        const clips = state.compressed === 1 ? '1 clip' : `${String(state.compressed)} clips`;
        const freed = `Compressed ${clips} and freed ${formatBytes(state.freedBytes)}.`;
        if (state.skipped === 0) {
          return freed;
        }
        const left =
          state.skipped === 1
            ? '1 clip was left as it was.'
            : `${String(state.skipped)} clips were left as they were.`;
        return `${freed} ${left}`;
      }
    }
  });

  protected stopCompressing(): void {
    this.compression.stop();
  }

  constructor() {
    void this.storage.refresh();
  }

  protected requestPersistence(): void {
    void this.storage.requestPersistence();
  }

  /**
   * Clears the audio cache, having confirmed the scope and then stopped
   * anything playing from it.
   *
   * Confirmed because this is the widest destructive action on the screen above
   * the danger zone: it deletes every clip of every reading on the device, and
   * it sat one button away from asking the browser to keep data — where the
   * *narrower* per-reading deletion in the reader has asked all along.
   *
   * The stop order matters and is the point: reporting an empty cache while a
   * clip out of it is still audible would be a report the learner can hear is
   * false.
   */
  protected async clearAudio(): Promise<void> {
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Delete saved audio for every story?',
      message: 'This cannot be undone. It permanently removes:',
      details: [
        'Every generated audio clip, for every story on this device',
        'Anything playing right now, which stops',
      ],
      footnote: 'Stories, translations, grammar results, and settings are not affected.',
      confirmLabel: 'Delete saved audio',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    this.stoppedPlayback.set(this.playback.isActive());
    this.playback.audioCacheCleared();
    await this.storage.clearAudioCache();
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
