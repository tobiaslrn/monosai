import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import type { ThemeSetting } from '../../domain/settings/settings';
import {
  SegmentedControlComponent,
  type SegmentedOption,
} from '../../shared-ui/segmented-control/segmented-control.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { SectionComponent } from '../../shared-ui/section/section.component';

const THEME_OPTIONS: readonly SegmentedOption<ThemeSetting>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Appearance controls. Reading preferences live in the reader's Aids panel. */
@Component({
  selector: 'mn-appearance-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegmentedControlComponent, SettingsRowComponent, SectionComponent],
  template: `
    <mn-section heading="Appearance" [rows]="true">
      <mn-settings-row label="Theme" end="control">
        <mn-segmented-control
          label="Theme"
          [options]="themeOptions"
          [value]="settings.theme()"
          (valueChange)="selectTheme($event)"
        />
      </mn-settings-row>
    </mn-section>
  `,
})
export class AppearanceSectionComponent {
  protected readonly settings = inject(AppSettingsStore);
  protected readonly themeOptions = THEME_OPTIONS;

  protected selectTheme(theme: ThemeSetting | undefined): void {
    if (theme !== undefined) {
      void this.settings.setTheme(theme);
    }
  }
}
