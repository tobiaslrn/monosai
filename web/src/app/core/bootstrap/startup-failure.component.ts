import {
  DOCUMENT,
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
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
      heading="Monosai could not start"
      [description]="failure().error.message"
      [dataStatus]="resetFailed() ? null : 'Your saved stories have not been changed.'"
    >
      <ng-container data-actions>
        <button
          type="button"
          class="mn-button mn-button--primary"
          [disabled]="storage.action() !== 'idle'"
          (click)="tryAgain()"
        >
          Try again
        </button>
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

  readonly failure = input.required<BootstrapFailure>();
  readonly retry = output();

  /** After a reset that reported failure, nothing can promise the stories are untouched. */
  protected readonly resetFailed = signal(false);

  protected tryAgain(): void {
    this.storage.clearFailure();
    this.retry.emit();
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
