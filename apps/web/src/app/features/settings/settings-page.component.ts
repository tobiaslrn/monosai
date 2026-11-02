import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { SettingsSectionComponent } from '../../shared-ui/settings-section/settings-section.component';
import { AboutSectionComponent } from './about-section.component';
import { AppearanceSectionComponent } from './appearance-section.component';
import { ModelsSectionComponent } from './models-section.component';
import { ReadingLevelRowComponent } from './reading-level-row.component';
import { StorageSectionComponent } from './storage-section.component';

@Component({
  selector: 'mn-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    SettingsSectionComponent,
    ReadingLevelRowComponent,
    ModelsSectionComponent,
    AppearanceSectionComponent,
    StorageSectionComponent,
    AboutSectionComponent,
  ],
  template: `
    <div class="mn-page settings-page">
      <mn-page-header heading="Settings" [backTo]="backTarget()" [backLabel]="backLabel()" />

      <mn-settings-section heading="Reading">
        <!-- A signpost rather than a setting: the details live on their own page. -->
        <mn-reading-level-row />
      </mn-settings-section>

      <mn-models-section />

      <mn-appearance-section />

      <mn-storage-section />
      <mn-about-section />
    </div>
  `,
  styles: `
    .settings-page {
      max-width: 40rem;
    }
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
