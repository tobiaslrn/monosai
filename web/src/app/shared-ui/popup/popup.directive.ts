import { Directive, ElementRef, inject, input, output, signal } from '@angular/core';

let nextPopupId = 0;

/**
 * A floating panel that is a native popover.
 *
 * The browser does the work a menu needs: a press outside and `Escape` dismiss
 * it, `Escape` and `hide()` hand focus back to what had it, and the panel sits in the top layer, so no
 * card's `overflow` clips it and no `z-index` has to out-bid its neighbours. No
 * listener is registered by any instance, which is what lets one live in every
 * row of a virtualised list. Position comes from CSS anchoring to the trigger
 * (`_popup.scss`).
 *
 *   <button [mnPopupTrigger]="menu" aria-haspopup="menu">…</button>
 *   <div mnPopup menu #menu="mnPopup" role="menu">…</div>
 *
 * `menu` adds what `role="menu"` promises: focus lands on the first item, and
 * the arrow keys, Home and End move between items.
 */
@Directive({
  selector: '[mnPopup]',
  exportAs: 'mnPopup',
  host: {
    class: 'mn-popup',
    popover: 'auto',
    '[attr.id]': 'id',
    '[style.position-anchor]': 'anchorName',
    '[class.mn-popup--menu]': 'menu()',
    '(beforetoggle)': 'onBeforeToggle($event)',
    '(toggle)': 'onToggle()',
    '(keydown)': 'onKeydown($event)',
  },
})
export class PopupDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly instance = nextPopupId++;

  readonly id = `mn-popup-${String(this.instance)}`;
  /** The name the trigger gives itself, which the panel anchors to. */
  readonly anchorName = `--mn-popup-${String(this.instance)}`;
  /** A list of actions: items are `role="menuitem"` and take the arrow keys. */
  readonly menu = input(false);

  readonly isOpen = signal(false);
  readonly opened = output<void>();
  readonly closed = output<void>();

  /** Closes the panel; the browser hands focus back to the trigger. */
  hide(): void {
    if (this.isNativeOpen() && typeof this.element.hidePopover === 'function') {
      this.element.hidePopover();
    }
  }

  /**
   * The state is set before the panel is shown, so what renders only while it is
   * open is there on the first frame and not one `toggle` later.
   */
  protected onBeforeToggle(event: Event): void {
    this.isOpen.set((event as ToggleEvent).newState === 'open');
  }

  /**
   * Whether it is open is read from the element rather than remembered: a
   * panel the browser hides because its node was moved or removed (a list that
   * reorders while a menu is open) fires no `toggle`, and a remembered state
   * would stay open and skip the next opening.
   */
  protected onToggle(): void {
    const open = this.isNativeOpen();
    this.isOpen.set(open);
    if (open) {
      if (this.menu()) {
        this.items()[0]?.focus();
      }
      this.opened.emit();
    } else {
      this.closed.emit();
    }
  }

  private isNativeOpen(): boolean {
    return this.element.matches(':popover-open');
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.menu()) {
      return;
    }
    const items = this.items();
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (current + 1) % items.length;
        break;
      case 'ArrowUp':
        next = (current <= 0 ? items.length : current) - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  private items(): HTMLElement[] {
    return Array.from(
      this.element.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
    );
  }
}

/** The control that opens a popup: it names the panel and anchors it. */
@Directive({
  selector: '[mnPopupTrigger]',
  host: {
    '[attr.popovertarget]': 'popup().id',
    '[attr.aria-controls]': 'popup().id',
    '[attr.aria-expanded]': 'popup().isOpen()',
    '[style.anchor-name]': 'popup().anchorName',
  },
})
export class PopupTriggerDirective {
  readonly popup = input.required<PopupDirective>({ alias: 'mnPopupTrigger' });
}
