import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { AppSectionComponent } from './app-section.component';
import { AppearanceSectionComponent } from './appearance-section.component';
import { DiagnosticsSectionComponent } from './diagnostics-section.component';
import { ModelsSectionComponent } from './models-section.component';
import { ReadingLevelRowComponent } from './reading-level-row.component';
import { StorageSectionComponent } from './storage-section.component';

@Component({
  selector: 'mn-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    ReadingLevelRowComponent,
    ModelsSectionComponent,
    AppearanceSectionComponent,
    StorageSectionComponent,
    AppSectionComponent,
    DiagnosticsSectionComponent,
  ],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Settings" [backTo]="backTarget()" [backLabel]="backLabel()" />

      <!--
        A signpost rather than a section: the learner profile lives on its own
        page and is reached from the Library, but connecting Anki is something
        people come here looking for.
      -->
      <mn-reading-level-row />

      <mn-appearance-section />

      <mn-models-section />

      <mn-storage-section />
      <mn-app-section />

      <mn-diagnostics-section />
    </div>
  `,
})
export class SettingsPageComponent {
  readonly from = input<string | undefined>();
  protected readonly backTarget = computed(() =>
    this.from() === 'generate' ? '/generate' : '/library',
  );
  protected readonly backLabel = computed(() =>
    this.from() === 'generate' ? 'Back to story' : 'Back to library',
  );
}
