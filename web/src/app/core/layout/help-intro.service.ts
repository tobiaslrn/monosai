import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppSettingsStore } from '../../application/settings/app-settings.store';

/** One offer per shell lifetime; successful dismissal is durable in app settings. */
@Injectable()
export class HelpIntroService {
  private readonly settings = inject(AppSettingsStore);
  private readonly router = inject(Router);
  private offered = false;
  readonly saveFailed = signal(false);
  readonly visible = signal(false);

  offer(): void {
    if (this.offered || this.settings.helpIntroSeen()) {
      return;
    }
    this.offered = true;
    this.visible.set(true);
  }

  async retrySave(): Promise<void> {
    this.saveFailed.set(!(await this.settings.markHelpIntroSeen()));
  }

  async finish(choice: 'guide' | 'dismiss'): Promise<void> {
    this.visible.set(false);
    await this.retrySave();
    if (choice === 'guide') {
      await this.router.navigateByUrl('/help');
    }
  }
}
