import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AppearanceSectionComponent } from './appearance-section.component';
import { DiagnosticsSectionComponent } from './diagnostics-section.component';
import { GenerationPolicySectionComponent } from './generation-policy-section.component';
import { LanguageAssetsSectionComponent } from './language-assets-section.component';
import { OpenRouterSectionComponent } from './openrouter-section.component';
import { StorageSectionComponent } from './storage-section.component';
import { TtsSectionComponent } from './tts-section.component';

@Component({
  selector: 'mn-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OpenRouterSectionComponent,
    TtsSectionComponent,
    GenerationPolicySectionComponent,
    AppearanceSectionComponent,
    LanguageAssetsSectionComponent,
    StorageSectionComponent,
    DiagnosticsSectionComponent,
  ],
  template: `
    <div class="mn-page">
      <header>
        <h1>Settings</h1>
      </header>
      <mn-openrouter-section />
      <mn-tts-section />
      <mn-generation-policy-section />
      <mn-appearance-section />
      <mn-language-assets-section />
      <mn-storage-section />
      <mn-diagnostics-section />
    </div>
  `,
})
export class SettingsPageComponent {}
