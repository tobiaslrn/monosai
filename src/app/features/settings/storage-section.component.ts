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
    <section class="mn-panel" aria-labelledby="mn-storage-heading">
      <h2 id="mn-storage-heading">Storage</h2>

      <dl>
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
          Delete saved audio
        </button>
      </div>
      <p class="mn-hint">
        Deleting saved audio removes every clip of every reading on this device, and stops anything
        playing. Readings, translations, and grammar results stay in place, and you can generate the
        audio again later.
      </p>
      <p aria-live="polite" class="mn-hint">
        @if (storage.audioCleared()) {
          Saved audio deleted{{ stoppedPlayback() ? ', and playback stopped' : '' }}.
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
  private readonly dialog = inject(Dialog);
  private readonly playback = inject(AudioPlaybackStore);
  protected readonly storage = inject(StorageStore);
  protected readonly resetStage = signal<'idle' | 'confirming'>('idle');
  /** Whether the clear that just ran also had to stop something playing. */
  protected readonly stoppedPlayback = signal(false);

  /**
   * What storage protection is, said without promising browser behaviour.
   *
   * Each state gets its own sentence. A refusal in particular says that the
   * browser was asked and declined, and that it may still grant later — which
   * is why the button stays enabled — rather than repeating the sentence that
   * was already there before the button was pressed.
   */
  protected readonly persistenceLabel = computed(() => {
    switch (this.storage.persistence()) {
      case 'granted':
        return 'Granted — the browser keeps Monosai data';
      case 'unsupported':
        return 'Not available — this browser does not offer storage protection';
      case 'refused':
        return 'Not granted — the browser declined. It may grant this later once you have used Monosai more.';
      case 'request-failed':
        return 'Not granted — the request could not be completed. Nothing was changed.';
      case 'not-asked':
        return 'Not granted — the browser may evict data when space runs low';
      case 'unknown':
        return 'Not reported by this browser';
    }
  });

  protected readonly usageLabel = computed(() => formatBytes(this.storage.status().usageBytes));

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
      title: 'Delete saved audio for every reading?',
      message: 'This cannot be undone. It permanently removes:',
      details: [
        'Every generated audio clip, for every reading on this device',
        'Anything playing right now, which stops',
      ],
      footnote: 'Readings, translations, grammar results, and settings are not affected.',
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
