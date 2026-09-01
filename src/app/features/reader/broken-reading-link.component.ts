import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * What a `/reader/:id` link that could never have named a reading gets.
 *
 * Reading ids are UUIDs, so a segment that is not one was mistyped, truncated,
 * or shared broken — nothing was ever stored under it. The reader's not-found
 * screen says "no longer here" and "may have been deleted", and neither is a
 * claim the application can make about an id that never existed. This screen
 * says only what is true and offers the same one way on.
 */
@Component({
  selector: 'mn-broken-reading-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="mn-page">
      <section class="mn-panel" role="alert">
        <h1>That link does not point to a reading</h1>
        <p class="mn-hint">
          The address is not one Monosai issues, so there is nothing to open. It was probably
          mistyped or cut short on the way here.
        </p>
        <p class="mn-hint">Nothing in your library was changed.</p>
        <a class="mn-button" routerLink="/library">Back to library</a>
      </section>
    </div>
  `,
  styles: `
    h1 {
      margin: 0;
      font-size: var(--text-lg);
    }
  `,
})
export class BrokenReadingLinkComponent {}
