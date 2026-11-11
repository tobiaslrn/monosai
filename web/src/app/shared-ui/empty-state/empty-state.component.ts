import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icon-set';

/**
 * A surface with nothing on it yet: the shared whole-page state
 * (`_state.scss`) in its quiet tone — not a fault, so no danger colour. The
 * title says what is empty, one sentence says what would fill it, and the
 * projected actions are the ways to fill it, primary first.
 *
 *   <mn-empty-state heading="No stories yet" description="Write one from your words.">
 *     <ng-container data-actions>…</ng-container>
 *   </mn-empty-state>
 */
@Component({
  selector: 'mn-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="mn-state" [attr.aria-labelledby]="headingId">
      <span class="mn-state__mark" aria-hidden="true"><mn-icon [name]="icon()" [size]="20" /></span>
      <h2 class="mn-state__title" [id]="headingId">{{ heading() }}</h2>
      <p class="mn-state__what">{{ description() }}</p>
      <div class="mn-state__actions">
        <ng-content select="[data-actions]" />
      </div>
    </section>
  `,
})
export class EmptyStateComponent {
  private static nextId = 0;
  protected readonly headingId = `mn-empty-state-${String(EmptyStateComponent.nextId++)}`;

  readonly heading = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input<IconName>('library');
}
