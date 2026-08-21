import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { AppearanceSectionComponent } from './appearance-section.component';
import { DiagnosticsSectionComponent } from './diagnostics-section.component';
import { GenerationPolicySectionComponent } from './generation-policy-section.component';
import { LanguageAssetsSectionComponent } from './language-assets-section.component';
import { LearningDataSectionComponent } from './learning-data-section.component';
import { OpenRouterSectionComponent } from './openrouter-section.component';
import { StorageSectionComponent } from './storage-section.component';
import { TtsSectionComponent } from './tts-section.component';

@Component({
  selector: 'mn-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    LearningDataSectionComponent,
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
      <mn-page-header heading="Settings" backTo="/library" backLabel="Back to library" />
      <mn-learning-data-section />
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
