import { ChangeDetectionStrategy, Component, Directive, inject, input } from '@angular/core';
import { PopupDirective } from '../popup/popup.directive';

/**
 * The one anchored panel: a menu of actions, a picker, or a small form that
 * hangs from the control that opened it.
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
 * A surface that holds work of its own, or that must stop the page behind it,
 * is an `mn-dialog`, not a menu.
 */
@Component({
  selector: 'mn-menu',
  exportAs: 'mnMenu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: PopupDirective, inputs: ['menu'], outputs: ['opened', 'closed'] }],
  host: {
    '[attr.role]': "popup.menu() ? 'menu' : role()",
    '[class.menu--form]': 'form()',
  },
  template: `<ng-content />`,
  styles: `
    :host(:popover-open) {
      display: block;
    }
    :host(:popover-open:not([role='menu'])) {
      padding: var(--space-3);
    }
    :host(.menu--form:popover-open) {
      display: grid;
      gap: var(--space-3);
      width: min(23rem, calc(100vw - 4 * var(--space-4)));
    }
  `,
})
export class MenuComponent {
  readonly popup = inject(PopupDirective);
  /** A small form rather than a list: its fields and actions in one column. */
  readonly form = input(false);
  /** The role of a panel that is not a menu, such as `dialog` for a small form. */
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

/** One action in an `mn-menu`. */
@Directive({
  selector: 'button[mnMenuItem]',
  host: {
    role: 'menuitem',
    class: 'mn-menu-item',
    '[class.mn-menu-item--danger]': "mnMenuItem() === 'danger'",
  },
})
export class MenuItemDirective {
  readonly mnMenuItem = input<'' | 'danger'>('');
}
