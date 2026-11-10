import { ChangeDetectionStrategy, Component, Directive, inject, input } from '@angular/core';
import { PopupDirective } from '../popup/popup.directive';

/**
 * A menu: a short list of commands or destinations that hangs from the control
 * that opened it, at every width.
 *
 *   <button mnButton="icon" type="button" [mnMenuTrigger]="actions" aria-haspopup="menu">…</button>
 *   <mn-menu #actions="mnMenu" [menu]="true" aria-label="Story actions">
 *     <button mnMenuItem type="button">Rename</button>
 *     <button mnMenuItem="danger" type="button">Delete</button>
 *   </mn-menu>
 *
 * It is a native popover in the top layer, so no card clips it, a press
 * outside or Escape closes it, and focus returns to the trigger; there is no
 * close button and no scrim. It has one alignment: below the trigger with the
 * end edges aligned, flipping above or to the other side only when there is
 * no room. `[menu]="true"` makes it a `role="menu"` with arrow-key movement.
 *
 * Choosing a value is a picker, and a form or a task is a task dialog
 * (`mn-sheet-popover`, `mn-dialog`); neither is a menu.
 */
@Component({
  selector: 'mn-menu',
  exportAs: 'mnMenu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: PopupDirective, inputs: ['menu'], outputs: ['opened', 'closed'] }],
  host: {
    '[attr.role]': "popup.menu() ? 'menu' : role()",
  },
  template: `<ng-content />`,
  styles: `
    /* Every menu is one column of rows, whether or not it is a role="menu". */
    :host(:popover-open) {
      display: flex;
      flex-direction: column;
      min-width: var(--menu-min-width);
      padding: var(--space-1);
    }
  `,
})
export class MenuComponent {
  readonly popup = inject(PopupDirective);
  /** The role of a panel that is not a `role="menu"`, such as `dialog` for a list of links. */
  readonly role = input<string | null>(null);

  /** Closes the panel; the browser hands focus back to the trigger. */
  hide(): void {
    this.popup.hide();
  }

  isOpen(): boolean {
    return this.popup.isOpen();
  }
}

/** The control that opens an `mn-menu`: it names the panel and anchors it. */
@Directive({
  selector: '[mnMenuTrigger]',
  host: {
    '[attr.popovertarget]': 'menu().popup.id',
    '[attr.aria-controls]': 'menu().popup.id',
    '[attr.aria-expanded]': 'menu().popup.isOpen()',
    '[style.anchor-name]': 'menu().popup.anchorName',
  },
})
export class MenuTriggerDirective {
  readonly menu = input.required<MenuComponent>({ alias: 'mnMenuTrigger' });
}

/**
 * One action in an `mn-menu`, or one destination when it is a link. It is a
 * `menuitem` only in a panel that is a menu; in a small dialog of choices a
 * link stays a link.
 */
@Directive({
  selector: 'button[mnMenuItem], a[mnMenuItem]',
  host: {
    class: 'mn-menu-item',
    '[attr.role]': "panel?.popup.menu() ? 'menuitem' : null",
    '[class.mn-menu-item--danger]': "mnMenuItem() === 'danger'",
  },
})
export class MenuItemDirective {
  protected readonly panel = inject(MenuComponent, { optional: true });
  readonly mnMenuItem = input<'' | 'danger'>('');
}
