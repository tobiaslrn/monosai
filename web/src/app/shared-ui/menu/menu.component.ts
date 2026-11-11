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
 * close button and no scrim. It is placed and drawn as a dropdown is — the same
 * surface, padding, rows, motion, and placement (`_dropdown.scss`) — and only
 * its width differs: it fits its commands between the menu's least and
 * greatest width. `[menu]="true"` makes it a `role="menu"` with arrow-key
 * movement.
 *
 * Choosing a value is a dropdown (`mn-select`), and a form
 * or a task is a task dialog (`mn-sheet-popover`, `mn-dialog`); neither is a
 * menu.
 */
@Component({
  selector: 'mn-menu',
  exportAs: 'mnMenu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: PopupDirective, inputs: ['menu'], outputs: ['opened', 'closed'] }],
  host: {
    '[attr.role]': "popup.menu() ? 'menu' : role()",
  },
  template: `<div class="mn-dropdown__content"><ng-content /></div>`,
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
  },
})
export class MenuTriggerDirective {
  readonly menu = input.required<MenuComponent>({ alias: 'mnMenuTrigger' });
}

/**
 * One action in an `mn-menu`, or one destination when it is a link. A menu that
 * sets one value marks the item in force with `checked`, and a check at its end. It is a
 * `menuitem` only in a panel that is a menu; in a small dialog of choices a
 * link stays a link.
 */
@Directive({
  selector: 'button[mnMenuItem], a[mnMenuItem]',
  host: {
    class: 'mn-dropdown-row mn-menu-item',
    '[attr.role]':
      "panel?.popup.menu() ? (checked() === null ? 'menuitem' : 'menuitemradio') : null",
    '[attr.aria-checked]': 'panel?.popup.menu() && checked() !== null ? checked() : null',
    '[class.mn-menu-item--danger]': "mnMenuItem() === 'danger'",
  },
})
export class MenuItemDirective {
  protected readonly panel = inject(MenuComponent, { optional: true });
  readonly mnMenuItem = input<'' | 'danger'>('');
  /** For a menu that sets one value, such as an order: whether this is the one in force. */
  readonly checked = input<boolean | null>(null);
}
