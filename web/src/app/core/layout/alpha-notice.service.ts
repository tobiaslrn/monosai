import { EnvironmentInjector, InjectionToken, Injectable, effect, inject } from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import type { AlphaNoticeDialogData } from '../../shared-ui/alpha-notice-dialog/alpha-notice-dialog.component';

/** An open alpha notice, which the service can close without an answer. */
export interface AlphaDialogHandle {
  readonly close: () => void;
}

export interface AlphaDialogOpener {
  readonly open: (data: AlphaNoticeDialogData) => Promise<AlphaDialogHandle>;
}

export const ALPHA_DIALOG_OPENER = new InjectionToken<AlphaDialogOpener>('Alpha dialog opener', {
  providedIn: 'root',
  factory: () => {
    const environmentInjector = inject(EnvironmentInjector);
    return {
      open: async (data: AlphaNoticeDialogData): Promise<AlphaDialogHandle> => {
        const [{ Dialog }, { AlphaNoticeDialogComponent }, { openDialog }] = await Promise.all([
          import('@angular/cdk/dialog'),
          import('../../shared-ui/alpha-notice-dialog/alpha-notice-dialog.component'),
          import('../../shared-ui/dialog/dialog'),
        ]);
        const dialog = environmentInjector.get(Dialog);
        const ref = openDialog(dialog, AlphaNoticeDialogComponent, {
          data,
          modal: true,
          role: 'alertdialog',
          labelledBy: 'mn-alpha-title',
          describedBy: 'mn-alpha-message',
          requireAnswer: true,
        });
        return {
          close: () => {
            ref.close();
          },
        };
      },
    };
  },
});

/**
 * Opens the alpha disclosure once per local installation.
 *
 * A tab that lost its database can save nothing, so the acknowledgment could
 * never be saved and the notice, which only an answer closes, would cover the
 * lost-database notice and its Reload. It is not offered there, and an open one
 * steps aside the moment the database is lost. Nothing was saved, so it is
 * offered again after the reload.
 */
@Injectable({ providedIn: 'root' })
export class AlphaNoticeService {
  private readonly settings = inject(AppSettingsStore);
  private readonly dialog = inject(ALPHA_DIALOG_OPENER);
  private readonly updates = inject(AppUpdateStore);
  private offered = false;
  private handle: AlphaDialogHandle | null = null;

  constructor() {
    effect(() => {
      if (this.databaseLost()) {
        this.stepAside();
      }
    });
  }

  async offer(): Promise<void> {
    if (this.offered || this.databaseLost() || this.settings.alphaNoticeSeen()) {
      return;
    }
    this.offered = true;

    const data: AlphaNoticeDialogData = {
      acknowledge: () => this.settings.markAlphaNoticeSeen(),
    };
    this.handle = await this.dialog.open(data);
    // The database may have been lost while the dialog's code was loading.
    if (this.databaseLost()) {
      this.stepAside();
    }
  }

  private databaseLost(): boolean {
    return this.updates.status().kind === 'superseded';
  }

  private stepAside(): void {
    this.handle?.close();
    this.handle = null;
  }
}
