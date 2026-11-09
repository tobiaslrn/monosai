import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

let nextBlockerListId = 0;

/**
 * What still stands in the way of an action: a heading on the canvas and one
 * card of rows, a hairline between them, like every other list in Monosai.
 *
 *   <mn-blocker-list heading="Before you can write">
 *     <mn-blocker>
 *       <strong>Text AI: </strong>Choose a model.
 *       <a mn-blocker-action mnButton routerLink="/settings">Open settings</a>
 *     </mn-blocker>
 *   </mn-blocker-list>
 */
@Component({
  selector: 'mn-blocker-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (heading(); as title) {
      <h2 class="title" [id]="headingId">{{ title }}</h2>
    }
    <div class="card" role="list" [attr.aria-labelledby]="heading() ? headingId : null">
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--group-gap);
      min-width: 0;
    }

    .title {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-tight);
    }

    .card {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: clip;
      border: 1px solid var(--border-subtle-faint);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
    }
  `,
})
export class BlockerListComponent {
  /** What the list stands in front of, said as the reason it is there. */
  readonly heading = input<string | null>(null);
  protected readonly headingId = `mn-blocker-list-${String(nextBlockerListId++)}`;
}

/**
 * One blocker, as a row: a warning mark, the sentence, and the way to clear
 * it at the row's end. When the row is too narrow for both, the action moves
 * under the sentence whole, on the sentence's edge — every row the same shape.
 */
@Component({
  selector: 'mn-blocker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { role: 'listitem' },
  template: `
    <div class="row">
      <mn-icon class="mn-lead" name="warning" tone="warning" [size]="18" />
      <p><ng-content /></p>
      <div class="action"><ng-content select="[mn-blocker-action]" /></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      container-type: inline-size;
    }

    :host(:not(:first-child)) {
      border-top: 1px solid var(--border-subtle);
    }

    .row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: var(--space-2) var(--space-3);
      align-items: center;
      min-height: var(--row-min-height);
      padding: var(--row-inset-block) var(--surface-inset);
      color: var(--text-primary);
      font-size: var(--text-sm);
      line-height: var(--leading-snug);
    }

    .row > mn-icon {
      align-self: center;
    }

    p {
      margin: 0;
    }

    .action:empty {
      display: none;
    }

    @container (max-width: 28rem) {
      .row {
        grid-template-columns: auto minmax(0, 1fr);
        align-items: start;
        padding-block: var(--stack-gap);
      }

      .row > mn-icon {
        align-self: start;
      }

      .action {
        grid-column: 2;
      }
    }
  `,
})
export class BlockerComponent {}
