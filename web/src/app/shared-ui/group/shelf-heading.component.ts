import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The heading over one group of a shelf's rows, such as a day of readings.
 *
 *   <section aria-labelledby="group-today">
 *     <mn-shelf-heading heading="Today" headingId="group-today" [first]="true" />
 *     <ul class="mn-list-group">…</ul>
 *   </section>
 *
 * The space above it separates one group from the last; the first heading on
 * the shelf only needs the space that sets it off the controls above. The
 * heading owns that space itself, rather than a gap between blocks, so a
 * virtualised list can measure it as part of the slot it occupies.
 */
@Component({
  selector: 'mn-shelf-heading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-first]': 'first()' },
  template: `<h2 class="mn-group-title" [id]="headingId()">{{ heading() }}</h2>`,
  styles: `
    :host {
      display: block;
      padding-block: var(--space-5) var(--space-2);
    }
    :host(.is-first) {
      padding-block-start: var(--space-2);
    }
  `,
})
export class ShelfHeadingComponent {
  readonly heading = input.required<string>();
  readonly headingId = input.required<string>();
  readonly first = input(false);
}
