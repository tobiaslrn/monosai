import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NotFoundPanelComponent } from '../../shared-ui/not-found/not-found-panel.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';

/**
 * What a `/reader/:id` link that could never have named a reading gets.
 *
 * Reading ids are UUIDs, so a segment that is not one was mistyped, truncated,
 * or shared broken — nothing was ever stored under it. The reader's not-found
 * screen says "no longer here" and "may have been deleted", and neither is a
 * claim the application can make about an id that never existed. This screen
 * says only what is true, in the same panel every other dead link gets.
 *
 * It is not the reader, so it keeps the application's chrome: the masthead the
 * shell renders, and a page header naming what was not found.
 */
@Component({
  selector: 'mn-broken-reading-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, NotFoundPanelComponent],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Link not recognised" backTo="/library" backLabel="Back to library" />
      <mn-not-found-panel
        heading="That link does not point to a reading"
        [explanation]="explanation"
      />
    </div>
  `,
})
export class BrokenReadingLinkComponent {
  protected readonly explanation = [
    'The address is not one Monosai issues, so there is nothing to open. It was probably mistyped or cut short on the way here.',
    'Nothing in your library was changed.',
  ];
}
