import {
  DOCUMENT,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
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
 * Storage durability, cache clearing, and the danger zone.
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
          <dt>Storage durability</dt>
          <dd>{{ persistenceLabel() }}</dd>
        </div>
        <div>
          <dt>Approximate usage</dt>
          <dd>{{ usageLabel() }}</dd>
        </div>
      </dl>

      @if (storage.status().canRequest) {
        <div class="actions">
          <button
            type="button"
            class="mn-button"
            [disabled]="storage.action() !== 'idle'"
            (click)="requestPersistence()"
          >
            Ask the browser to keep Monosai data
          </button>
        </div>
      }

      <div class="actions">
        <button
          type="button"
          class="mn-button"
          [disabled]="storage.action() !== 'idle'"
          (click)="clearAudio()"
        >
          Clear audio cache
        </button>
        <p class="mn-hint">
          Removes saved audio only. Readings, translations, and grammar results stay.
        </p>
        <p aria-live="polite" class="mn-hint">
          @if (storage.audioCleared()) {
            Audio cache cleared.
          }
        </p>
      </div>

      <div class="danger">
        <h3>Danger zone</h3>
        <p class="mn-hint">
          A full reset permanently deletes every reading, snapshot, saved setting, and cached aid on
          this device. It cannot be undone.
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
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: space-between;
    }

    dt {
      color: var(--text-secondary);
    }

    dd {
      margin: 0;
    }

    .actions,
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

    .actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .confirm,
    .failure {
      color: var(--status-danger);
    }
  `,
})
export class StorageSectionComponent {
  private readonly document = inject(DOCUMENT);
  protected readonly storage = inject(StorageStore);
  protected readonly resetStage = signal<'idle' | 'confirming'>('idle');

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

  protected clearAudio(): void {
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
