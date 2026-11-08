import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * A hairline between two settings in one card. It is a rule, not decoration:
 * it is what stops two settings reading as one.
 */
@Component({
  selector: 'mn-divider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: ``,
  styles: `
    :host {
      display: block;
      height: 1px;
      background: var(--border-subtle);
    }
  `,
})
export class DividerComponent {}
