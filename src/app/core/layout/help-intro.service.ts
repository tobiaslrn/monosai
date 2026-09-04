import { Injectable, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { HelpIntroDialogComponent } from './help-intro-dialog.component';

/** One offer per shell lifetime; successful dismissal is durable in app settings. */
@Injectable()
export class HelpIntroService {
  private readonly settings = inject(AppSettingsStore);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private offered = false;
  readonly saveFailed = signal(false);

  offer(): void {
    if (this.offered || this.settings.helpIntroSeen()) {
      return;
    }
    this.offered = true;
    const ref = this.dialog.open<'guide' | 'dismiss'>(HelpIntroDialogComponent, {
      ariaLabelledBy: 'mn-help-intro-title',
      ariaDescribedBy: 'mn-help-intro-description',
      restoreFocus: 'mn-app-bar a[aria-label="Help"]',
    });
    ref.closed.subscribe((choice) => {
      void this.finish(choice);
    });
  }

  async retrySave(): Promise<void> {
    this.saveFailed.set(!(await this.settings.markHelpIntroSeen()));
  }

  private async finish(choice: 'guide' | 'dismiss' | undefined): Promise<void> {
    await this.retrySave();
    if (choice === 'guide') {
      await this.router.navigateByUrl('/help');
    }
  }
}
