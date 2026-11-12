import {
  DOCUMENT,
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { StorageStore } from '../../application/settings/storage.store';
import { CLOCK } from '../../application/shared/repository-tokens';
import type { Clock } from '../../domain/shared/clock';
import { confirmLater } from '../../shared-ui/confirm-dialog/confirm-later';
import { ButtonDirective } from '../../shared-ui/button/button';
import { ErrorScreenComponent } from '../../shared-ui/error-screen/error-screen.component';
import { PageComponent } from '../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { SectionComponent } from '../../shared-ui/section/section.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { StatusLineComponent } from '../../shared-ui/status-line/status-line.component';
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
  imports: [
    ButtonDirective,
    ErrorScreenComponent,
    PageComponent,
    PageHeaderComponent,
    SectionComponent,
    SettingsRowComponent,
    StatusLineComponent,
  ],
  template: `
    <main id="mn-main" class="mn-main" tabindex="-1">
      <mn-page>
        <mn-page-header heading="Monosai" [home]="true" />
        <mn-error-screen
          heading="Monosai could not start"
          [description]="failure().error.message"
          [dataStatus]="resetFailed() ? null : 'Your data is unchanged.'"
        >
          <ng-container data-actions>
            @if (failure().error.code === 'newer-version') {
              <button
                type="button"
                mnButton="primary"
                [disabled]="reloading() || storage.action() !== 'idle'"
                [attr.aria-busy]="reloading() ? 'true' : null"
                (click)="reload()"
              >
                {{ reloading() ? 'Reloading…' : 'Reload' }}
              </button>
            } @else {
              <button
                type="button"
                mnButton="primary"
                [disabled]="storage.action() !== 'idle'"
                (click)="tryAgain()"
              >
                Try again
              </button>
            }
            @if (failure().resetMayHelp) {
              <button
                type="button"
                mnButton
                [disabled]="storage.action() !== 'idle'"
                (click)="saveCopy()"
              >
                Save a copy
              </button>
            }
          </ng-container>
        </mn-error-screen>
        @if (failure().resetMayHelp) {
          <mn-section heading="Storage" [rows]="true">
            <mn-settings-row
              label="Delete all data"
              action="danger"
              testId="delete-all-data"
              [disabled]="storage.action() !== 'idle'"
              (pressed)="deleteAllData()"
            />
            @if (storage.failure(); as actionFailure) {
              <mn-status-line mn-section-footer tone="danger">{{
                actionFailure.message
              }}</mn-status-line>
            }
          </mn-section>
        } @else if (storage.failure(); as actionFailure) {
          <mn-status-line tone="danger">{{ actionFailure.message }}</mn-status-line>
        }
      </mn-page>
    </main>
  `,
})
export class StartupFailureComponent {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly clock = inject<Clock>(CLOCK);
  protected readonly storage = inject(StorageStore);
  private readonly updates = inject(AppUpdateStore);

  readonly failure = input.required<BootstrapFailure>();
  readonly retry = output();

  /** After a reset that reported failure, nothing can promise the stories are untouched. */
  protected readonly resetFailed = signal(false);

  /** The reload waits for an update check, so the button says it is working. */
  protected readonly reloading = signal(false);

  protected tryAgain(): void {
    this.storage.clearFailure();
    this.retry.emit();
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
    const confirmed = await confirmLater(this.injector, {
      title: 'Delete all Monosai data?',
      message: 'This cannot be undone. It removes:',
      details: [
        'Every story, with its translations, grammar results, and audio',
        'Your word lists and reading level',
        'All settings, including your OpenRouter API key',
        'Files Monosai downloaded to work offline',
      ],
      footnote:
        'Anki is not affected. Monosai cannot load a saved copy back, and it leaves out your key and audio.',
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
