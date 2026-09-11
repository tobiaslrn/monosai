import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MainNavComponent } from '../../core/layout/main-nav.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { AppSectionComponent } from './app-section.component';
import { AppearanceSectionComponent } from './appearance-section.component';
import { DiagnosticsSectionComponent } from './diagnostics-section.component';
import { ModelsSectionComponent } from './models-section.component';
import { ReadingLevelRowComponent } from './reading-level-row.component';
import { StorageSectionComponent } from './storage-section.component';

/**
 * A tab page, so it has no Back of its own — except when the generate form sent
 * the learner here to finish setting up, where the way back to the story they
 * were writing matters more than anything else in the bar.
 */
@Component({
  selector: 'mn-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MainNavComponent,
    PageHeaderComponent,
    ReadingLevelRowComponent,
    ModelsSectionComponent,
    AppearanceSectionComponent,
    StorageSectionComponent,
    AppSectionComponent,
    DiagnosticsSectionComponent,
  ],
  template: `
    <div class="mn-page settings-page">
      <mn-page-header
        heading="Settings"
        [titleHidden]="true"
        [backTo]="fromGenerate() ? '/generate' : null"
        backLabel="Back to story"
      >
        <mn-main-nav placement="top" helpOrigin="/settings" />
      </mn-page-header>

      <!--
        A signpost rather than a section: the learner profile lives on its own
        page and is also reached from Home, but connecting Anki is something
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
  protected readonly fromGenerate = computed(() => this.from() === 'generate');
}
