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
        const [{ Dialog }, { AlphaNoticeDialogComponent }] = await Promise.all([
          import('@angular/cdk/dialog'),
          import('../../shared-ui/alpha-notice-dialog/alpha-notice-dialog.component'),
        ]);
        const dialog = environmentInjector.get(Dialog);
        dialog.open<void, AlphaNoticeDialogData>(AlphaNoticeDialogComponent, {
          data,
          role: 'alertdialog',
          ariaLabelledBy: 'mn-alpha-title',
          ariaDescribedBy: 'mn-alpha-message',
          hasBackdrop: true,
          disableClose: true,
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
