import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { mediaQuerySignal } from './media-query';
import type { ThemePreference } from './theme';

/**
 * Applies the appearance preference to the document.
 *
 * `system` removes the attribute so the stylesheet's `prefers-color-scheme`
 * rules apply; an explicit choice pins `data-theme` in both directions.
 * Persistence is owned by the settings repository, which calls `apply`.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly systemPrefersDark = mediaQuerySignal('(prefers-color-scheme: dark)');
  private readonly preferenceSignal = signal<ThemePreference>('system');

  readonly preference = this.preferenceSignal.asReadonly();

  apply(preference: ThemePreference): void {
    this.preferenceSignal.set(preference);
    const root = this.document.documentElement;
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }
  }

  /** Resolves the effective appearance for UI that must describe the active theme. */
  resolved(): 'light' | 'dark' {
    const preference = this.preferenceSignal();
    if (preference === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return preference;
  }
}
