import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { SectionComponent } from '../../shared-ui/section/section.component';
import { PageComponent } from '../../shared-ui/layout/layout';
import { AboutSectionComponent } from './about-section.component';
import { AiSectionComponent } from './ai-section.component';
import { AppearanceSectionComponent } from './appearance-section.component';
import { ReadingLevelRowComponent } from './reading-level-row.component';
import { StorageSectionComponent } from './storage-section.component';

@Component({
  selector: 'mn-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageComponent,
    PageHeaderComponent,
    SectionComponent,
    ReadingLevelRowComponent,
    AiSectionComponent,
    AppearanceSectionComponent,
    StorageSectionComponent,
    AboutSectionComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Settings" [backTo]="backTarget()" [backLabel]="backLabel()" />

      <mn-section heading="Reading" [rows]="true">
        <!-- A signpost rather than a setting: the details live on their own page. -->
        <mn-reading-level-row />
      </mn-section>

      <mn-ai-section />

      <mn-appearance-section />

      <mn-storage-section />
      <mn-about-section />
    </mn-page>
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
