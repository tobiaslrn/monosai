import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import type { ThemeSetting } from '../../domain/settings/settings';

const THEME_OPTIONS: readonly { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Appearance controls. Reading preferences live in the reader's Aids panel. */
@Component({
  selector: 'mn-appearance-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mn-card" aria-labelledby="mn-appearance-heading">
      <div class="mn-stack">
        <h2 id="mn-appearance-heading" class="mn-card-title">Appearance</h2>

        <fieldset>
          <legend>Theme</legend>
          <div class="mn-segmented">
            @for (option of themeOptions; track option.value) {
              <label>
                <input
                  type="radio"
                  name="theme"
                  [value]="option.value"
                  [checked]="settings.theme() === option.value"
                  (change)="selectTheme(option.value)"
                />
                <span>{{ option.label }}</span>
              </label>
            }
          </div>
          <p class="mn-hint">System follows your device's light or dark setting.</p>
        </fieldset>
      </div>
    </section>
  `,
  styles: `
    fieldset {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      border: 0;
    }

    legend {
      margin-bottom: var(--space-2);
      padding: 0;
      font-weight: var(--weight-medium);
    }

    p {
      margin: 0;
    }
  `,
})
export class AppearanceSectionComponent {
  protected readonly settings = inject(AppSettingsStore);
  protected readonly themeOptions = THEME_OPTIONS;

  protected selectTheme(theme: ThemeSetting): void {
    void this.settings.setTheme(theme);
  }
}
