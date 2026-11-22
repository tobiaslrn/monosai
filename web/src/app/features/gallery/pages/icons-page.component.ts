import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent } from '../../../shared-ui/icon/icon.component';
import { ICON_SET, type IconName } from '../../../shared-ui/icon/icon-set';
import { ClusterComponent, GridComponent, PageComponent } from '../../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import { SectionComponent } from '../../../shared-ui/section/section.component';

/** Every glyph in the set, then the tones and the three size roles. */
@Component({
  selector: 'mn-gallery-icons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClusterComponent,
    GridComponent,
    IconComponent,
    PageComponent,
    PageHeaderComponent,
    SectionComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Icons" backTo="/gallery" backLabel="Back to gallery" />

      <mn-section heading="Sizes">
        <mn-cluster>
          <mn-cluster [gap]="2"><mn-icon name="info" size="inline" /><span>Inline</span></mn-cluster>
          <mn-cluster [gap]="2"><mn-icon name="info" /><span>Control</span></mn-cluster>
          <mn-cluster [gap]="2"><mn-icon name="info" size="feature" /><span>Feature</span></mn-cluster>
        </mn-cluster>
      </mn-section>

      <mn-section heading="Tones">
        <mn-grid min="9rem">
          @for (tone of tones; track tone) {
            <mn-cluster [gap]="2"
              ><mn-icon name="star" [tone]="tone" /><span>{{ tone }}</span></mn-cluster
            >
          }
        </mn-grid>
      </mn-section>

      <mn-section heading="Glyphs">
        <mn-grid min="9rem">
          @for (name of names; track name) {
            <mn-cluster [gap]="2"
              ><mn-icon [name]="name" /><span>{{ name }}</span></mn-cluster
            >
          }
        </mn-grid>
      </mn-section>
    </mn-page>
  `,
})
export class GalleryIconsComponent {
  protected readonly names = Object.keys(ICON_SET) as IconName[];
  protected readonly tones = [
    'inherit',
    'quiet',
    'action',
    'success',
    'warning',
    'danger',
  ] as const;
}
