import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * What still stands in the way of an action, one line each.
 *
 *   <mn-blocker-list>
 *     <mn-blocker>
 *       <strong>Text AI: </strong>Choose a model.
 *       <a mn-blocker-action mnButton routerLink="/settings">Open settings</a>
 *     </mn-blocker>
 *   </mn-blocker-list>
 */
@Component({
  selector: 'mn-blocker-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'list' },
  template: `<ng-content />`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
  `,
})
export class BlockerListComponent {}

/**
 * One blocker: a warning mark, the sentence, and the way to clear it beneath
 * the sentence. Every line keeps that shape, so a short sentence never puts its
 * button beside it while the next one's sits below.
 */
@Component({
  selector: 'mn-blocker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { role: 'listitem' },
  template: `
    <mn-icon class="mn-lead" name="warning" tone="warning" [size]="18" />
    <p><ng-content /></p>
    <div class="action"><ng-content select="[mn-blocker-action]" /></div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--space-2) var(--space-3);
      align-items: start;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    p {
      margin: 0;
    }

    .action {
      grid-column: 2;
    }

    .action:empty {
      display: none;
    }
  `,
})
export class BlockerComponent {}
