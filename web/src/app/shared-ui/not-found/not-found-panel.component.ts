import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-set';

/**
 * Something the learner went to is not there: a story deleted elsewhere, a link
 * that points nowhere, a generation that ended with its tab. It is the shared
 * whole-page state (`_state.scss`) in its quiet tone — not a fault, so no
 * danger colour — with the way back first.
 *
 *   <mn-not-found-panel
 *     heading="This story is no longer here"
 *     [explanation]="['It may have been deleted.', 'Nothing else in your library was affected.']"
 *   />
 *
 * The first line of `explanation` says what happened; a second says what is
 * safe or what to do.
 */
@Component({
  selector: 'mn-not-found-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RouterLink],
  template: `
    <section class="mn-state" role="alert">
      <span class="mn-state__mark" aria-hidden="true"><mn-icon [name]="icon()" [size]="20" /></span>
      <h2 class="mn-state__title">{{ heading() }}</h2>
      @for (line of explanation(); track line; let first = $first) {
        <p [class.mn-state__what]="first" [class.mn-state__next]="!first">{{ line }}</p>
      }
      <div class="mn-state__actions">
        <a class="mn-button mn-button--primary" [routerLink]="primaryLink()">{{
          primaryLabel()
        }}</a>
        @if (secondaryLink(); as link) {
          <a class="mn-button" [routerLink]="link">{{ secondaryLabel() }}</a>
        }
      </div>
    </section>
  `,
})
export class NotFoundPanelComponent {
  readonly heading = input.required<string>();
  readonly explanation = input.required<readonly string[]>();
  readonly icon = input<IconName>('search');
  readonly primaryLink = input<string>('/library');
  readonly primaryLabel = input('Go to library');
  readonly secondaryLink = input<string | null>(null);
  readonly secondaryLabel = input('');
}
