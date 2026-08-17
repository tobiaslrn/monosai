import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppearanceSectionComponent } from './appearance-section.component';
import { DiagnosticsSectionComponent } from './diagnostics-section.component';

@Component({
  selector: 'mn-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppearanceSectionComponent, DiagnosticsSectionComponent],
  template: `
    <div class="mn-page">
      <header>
        <h1>Settings</h1>
      </header>
      <mn-appearance-section />
      <mn-diagnostics-section />
    </div>
  `,
})
export class SettingsPageComponent {}
