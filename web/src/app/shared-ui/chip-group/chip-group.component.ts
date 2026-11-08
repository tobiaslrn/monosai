import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';

/**
 * A named set of toggle buttons that pick values, wrapping as a whole.
 *
 *   <mn-chip-group label="Genre">
 *     <button mnButton type="button" [attr.aria-pressed]="chosen">Mystery</button>
 *   </mn-chip-group>
 *
 * Unlike a cluster, a chip's own label may wrap: a custom value can be longer
 * than the row. Styles reach the projected buttons and are therefore global,
 * rooted at the element.
 */
@Component({
  selector: 'mn-chip-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { role: 'group', '[attr.aria-label]': 'label()' },
  template: `<ng-content />`,
  styles: `
    mn-chip-group {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      min-width: 0;
    }

    mn-chip-group > button {
      max-width: 100%;
      overflow-wrap: break-word;
      white-space: normal;
    }
  `,
})
export class ChipGroupComponent {
  readonly label = input.required<string>();
}
