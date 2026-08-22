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
    <section class="mn-panel" aria-labelledby="mn-appearance-heading">
      <h2 id="mn-appearance-heading">Appearance</h2>

      <fieldset>
        <legend>Theme</legend>
        <div class="options">
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
      padding: 0;
      font-weight: 500;
    }

    .options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }

    label {
      display: inline-flex;
      gap: var(--space-2);
      align-items: center;
      min-height: var(--touch-target);
      cursor: pointer;
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
