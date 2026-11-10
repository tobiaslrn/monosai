import { EnvironmentInjector, InjectionToken, Injectable, inject } from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import type { AlphaNoticeDialogData } from '../../shared-ui/alpha-notice-dialog/alpha-notice-dialog.component';

export interface AlphaDialogOpener {
  readonly open: (data: AlphaNoticeDialogData) => Promise<void>;
}

export const ALPHA_DIALOG_OPENER = new InjectionToken<AlphaDialogOpener>('Alpha dialog opener', {
  providedIn: 'root',
  factory: () => {
    const environmentInjector = inject(EnvironmentInjector);
    return {
      open: async (data: AlphaNoticeDialogData): Promise<void> => {
        const [{ Dialog }, { AlphaNoticeDialogComponent }, { openDialog }] = await Promise.all([
          import('@angular/cdk/dialog'),
          import('../../shared-ui/alpha-notice-dialog/alpha-notice-dialog.component'),
          import('../../shared-ui/dialog/dialog'),
        ]);
        const dialog = environmentInjector.get(Dialog);
        openDialog(dialog, AlphaNoticeDialogComponent, {
          data,
          modal: true,
          role: 'alertdialog',
          labelledBy: 'mn-alpha-title',
          describedBy: 'mn-alpha-message',
          requireAnswer: true,
        });
      },
    };
  },
});

/** Opens the alpha disclosure once per local installation. */
@Injectable({ providedIn: 'root' })
export class AlphaNoticeService {
  private readonly settings = inject(AppSettingsStore);
  private readonly dialog = inject(ALPHA_DIALOG_OPENER);
  private offered = false;

  async offer(): Promise<void> {
    if (this.offered || this.settings.alphaNoticeSeen()) {
      return;
    }
    this.offered = true;

    const data: AlphaNoticeDialogData = {
      acknowledge: () => this.settings.markAlphaNoticeSeen(),
    };
    await this.dialog.open(data);
  }
}
