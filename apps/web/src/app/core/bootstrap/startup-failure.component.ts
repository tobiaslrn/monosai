import {
  DOCUMENT,
  ChangeDetectionStrategy,
  computed,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { StorageStore } from '../../application/settings/storage.store';
import { CLOCK } from '../../application/shared/repository-tokens';
import type { Clock } from '../../domain/shared/clock';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { ErrorScreenComponent } from '../../shared-ui/error-screen/error-screen.component';
import type { BootstrapFailure } from './initialization-state';

/** Long enough for the browser to have started the download from the object URL. */
const EXPORT_URL_LIFETIME_MS = 60_000;

/**
 * The recovery screen shown instead of the app when startup fails.
 *
 * When the stored data is the problem, retrying cannot help, so it also offers
 * a copy of the data and then the full reset that Settings offers.
 */
@Component({
  selector: 'mn-startup-failure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ErrorScreenComponent],
  template: `
    <mn-error-screen
      [heading]="openElsewhere() ? 'Monosai is open in another tab' : 'Monosai could not start'"
      [description]="
        openElsewhere() ? 'Only one tab can use Monosai at a time.' : failure().error.message
      "
      [dataStatus]="resetFailed() ? null : 'Your saved stories have not been changed.'"
    >
      <ng-container data-actions>
        @if (openElsewhere()) {
          <button type="button" class="mn-button mn-button--primary" (click)="reloadHere()">
            Reload
          </button>
        } @else if (failure().error.code === 'newer-version') {
          <button
            type="button"
            class="mn-button mn-button--primary"
            [disabled]="reloading() || storage.action() !== 'idle'"
            [attr.aria-busy]="reloading() ? 'true' : null"
            (click)="reload()"
          >
            {{ reloading() ? 'Reloading…' : 'Reload' }}
          </button>
        } @else {
          <button
            type="button"
            class="mn-button mn-button--primary"
            [disabled]="storage.action() !== 'idle'"
            (click)="tryAgain()"
          >
            Try again
          </button>
        }
        @if (failure().resetMayHelp) {
          <button
            type="button"
            class="mn-button"
            [disabled]="storage.action() !== 'idle'"
            (click)="saveCopy()"
          >
            Save a copy of my data
          </button>
          <button
            type="button"
            class="mn-button mn-button--danger"
            [disabled]="storage.action() !== 'idle'"
            (click)="deleteAllData()"
          >
            Delete all Monosai data
          </button>
        }
      </ng-container>
    </mn-error-screen>
    @if (storage.failure(); as actionFailure) {
      <p role="alert" class="action-failure mn-notice mn-notice--error">
        {{ actionFailure.message }}
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding-inline: var(--space-4);
    }

    .action-failure {
      max-width: 35rem;
      margin-inline: auto;
    }
  `,
})
export class StartupFailureComponent {
  private readonly document = inject(DOCUMENT);
  private readonly dialog = inject(Dialog);
  private readonly clock = inject<Clock>(CLOCK);
  protected readonly storage = inject(StorageStore);
  private readonly updates = inject(AppUpdateStore);

  readonly failure = input.required<BootstrapFailure>();
  readonly retry = output();

  /** Another tab's engine owns the data; this tab can only start once that one is gone. */
  protected readonly openElsewhere = computed(
    () =>
      this.failure().error.domain === 'engine' &&
      this.failure().error.code === 'open-in-another-tab',
  );

  /** After a reset that reported failure, nothing can promise the stories are untouched. */
  protected readonly resetFailed = signal(false);

  /** The reload waits for an update check, so the button says it is working. */
  protected readonly reloading = signal(false);

  protected tryAgain(): void {
    this.storage.clearFailure();
    this.retry.emit();
  }

  /** The engine decides whether it may start only when it boots, so only a reload asks again. */
  protected reloadHere(): void {
    this.document.defaultView?.location.reload();
  }

  /** Retrying in this page cannot get past a newer database; only a newer build can. */
  protected async reload(): Promise<void> {
    this.reloading.set(true);
    try {
      await this.updates.reloadIntoLatest();
    } finally {
      this.reloading.set(false);
    }
  }

  protected async saveCopy(): Promise<void> {
    const file = await this.storage.exportData();
    const view = this.document.defaultView;
    if (file === null || view === null) {
      return;
    }
    const url = view.URL.createObjectURL(file);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `monosai-data-${new Date(this.clock.now()).toISOString().slice(0, 10)}.json`;
    link.click();
    view.setTimeout(() => {
      view.URL.revokeObjectURL(url);
    }, EXPORT_URL_LIFETIME_MS);
  }

  protected async deleteAllData(): Promise<void> {
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Delete all Monosai data?',
      message: 'This cannot be undone. It permanently removes from this browser:',
      details: [
        'Every story, with its translations, grammar results, and audio',
        'Your word lists and reading level',
        'All settings, including your OpenRouter API key',
        'Files Monosai downloaded to work offline',
      ],
      footnote:
        'Your Anki collection is not affected. Monosai cannot load a saved copy back, and it does not include your API key or audio.',
      confirmLabel: 'Delete everything',
      cancelLabel: 'Keep my data',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    if (await this.storage.resetAllData()) {
      this.document.defaultView?.location.reload();
    } else {
      this.resetFailed.set(true);
    }
  }
}
