import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import type { ThemeSetting } from '../../domain/settings/settings';
import { SettingsSectionComponent } from '../../shared-ui/settings-section/settings-section.component';

const THEME_OPTIONS: readonly { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Appearance controls. Reading preferences live in the reader's Aids panel. */
@Component({
  selector: 'mn-appearance-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SettingsSectionComponent],
  template: `
    <mn-settings-section heading="Appearance">
      <div class="mn-card mn-card--flush mn-settings-card">
        <div class="mn-settings-row mn-settings-row--action">
          <div class="mn-settings-row__label">
            <span class="mn-settings-row__title">Theme</span>
          </div>
          <fieldset>
            <legend class="mn-visually-hidden">Theme</legend>
            <div class="mn-segmented mn-segmented--joined">
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
          </fieldset>
        </div>
      </div>
    </mn-settings-section>
  `,
  styles: `
    fieldset {
      display: block;
      flex: 0 1 auto;
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
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
