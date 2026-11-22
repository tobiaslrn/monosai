import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PageComponent } from '../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { RowComponent } from '../../shared-ui/row/row.component';
import { SectionComponent } from '../../shared-ui/section/section.component';
import { GALLERY_PAGES } from './gallery-pages';

/**
 * The gallery's index: every shared-ui primitive, drawn by the primitive
 * itself in each state that changes how it looks. It is the visual reference
 * for the design rules and the subject of the screenshot baselines. It exists
 * only in the development and gallery builds (see `core/routing/dev-routes.ts`).
 */
@Component({
  selector: 'mn-gallery-index',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PageComponent, PageHeaderComponent, RowComponent, SectionComponent],
  template: `
    <mn-page>
      <mn-page-header heading="Gallery" backTo="/library" backLabel="Back to library" />
      <mn-section heading="Primitives" [rows]="true">
        @for (page of pages; track page.slug) {
          <mn-row [link]="['/gallery', page.slug]" [heading]="page.title">
            <span mn-row-meta>{{ page.summary }}</span>
            <mn-icon name="chevron-right" />
          </mn-row>
        }
      </mn-section>
    </mn-page>
  `,
})
export class GalleryIndexComponent {
  protected readonly pages = GALLERY_PAGES;
}
