import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppearanceSectionComponent } from './appearance-section.component';
import { DiagnosticsSectionComponent } from './diagnostics-section.component';
import { StorageSectionComponent } from './storage-section.component';

@Component({
  selector: 'mn-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppearanceSectionComponent, StorageSectionComponent, DiagnosticsSectionComponent],
  template: `
    <div class="mn-page">
      <header>
        <h1>Settings</h1>
      </header>
      <mn-appearance-section />
      <mn-storage-section />
      <mn-diagnostics-section />
    </div>
  `,
})
export class SettingsPageComponent {}
