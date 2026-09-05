import { Injectable, effect, inject } from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { ThemeService } from './theme.service';

/**
 * Applies the persisted appearance preference to the document whenever it
 * changes, keeping DOM manipulation out of the application layer.
 */
@Injectable({ providedIn: 'root' })
export class ThemeSynchronizer {
  private readonly settings = inject(AppSettingsStore);
  private readonly theme = inject(ThemeService);

  constructor() {
    effect(() => {
      this.theme.apply(this.settings.theme());
    });
  }
}
