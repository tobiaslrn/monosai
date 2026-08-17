import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from '../../core/platform/theme.service';
import { THEME_PREFERENCES, type ThemePreference } from '../../core/platform/theme';

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

@Component({
  selector: 'mn-appearance-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mn-panel" aria-labelledby="mn-appearance-heading">
      <h2 id="mn-appearance-heading">Appearance</h2>
      <fieldset>
        <legend>Theme</legend>
        @for (option of options; track option) {
          <label>
            <input
              type="radio"
              name="theme"
              [value]="option"
              [checked]="theme.preference() === option"
              (change)="select(option)"
            />
            <span>{{ labels[option] }}</span>
          </label>
        }
      </fieldset>
      <p class="mn-hint">System follows your device's light or dark setting.</p>
    </section>
  `,
  styles: `
    fieldset {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      border: 0;
    }

    legend {
      padding: 0;
      font-weight: 500;
    }

    label {
      display: inline-flex;
      gap: var(--space-2);
      align-items: center;
      min-height: var(--touch-target);
      padding-inline: var(--space-2);
      cursor: pointer;
    }
  `,
})
export class AppearanceSectionComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly options = THEME_PREFERENCES;
  protected readonly labels = THEME_LABELS;

  protected select(preference: ThemePreference): void {
    this.theme.apply(preference);
  }
}
