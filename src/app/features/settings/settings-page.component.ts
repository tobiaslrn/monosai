import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { AppSectionComponent } from './app-section.component';
import { AppearanceSectionComponent } from './appearance-section.component';
import { DiagnosticsSectionComponent } from './diagnostics-section.component';
import { GenerationPolicySectionComponent } from './generation-policy-section.component';
import { LanguageAssetsSectionComponent } from './language-assets-section.component';
import { LearningDataSectionComponent } from './learning-data-section.component';
import { ModelsSectionComponent } from './models-section.component';
import { StorageSectionComponent } from './storage-section.component';

@Component({
  selector: 'mn-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    LearningDataSectionComponent,
    ModelsSectionComponent,
    GenerationPolicySectionComponent,
    AppearanceSectionComponent,
    LanguageAssetsSectionComponent,
    StorageSectionComponent,
    AppSectionComponent,
    DiagnosticsSectionComponent,
  ],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Settings" backTo="/library" backLabel="Back to library" />

      <section class="mn-panel setup-panel" aria-labelledby="mn-setup-heading">
        <h2 id="mn-setup-heading">Your setup</h2>
        <p class="mn-hint">Vocabulary and grammar shape the reading experience.</p>
        <mn-learning-data-section />
      </section>

      <mn-appearance-section />

      <mn-models-section />
      <mn-generation-policy-section />

      <mn-storage-section />
      <mn-app-section />

      <mn-language-assets-section />
      <mn-diagnostics-section />
    </div>
  `,
  styles: `
    .setup-panel {
      gap: var(--space-2);
    }

    .setup-panel h2 {
      font-size: var(--text-lg);
    }

    .setup-panel p {
      margin: 0;
    }
  `,
})
export class SettingsPageComponent {}
