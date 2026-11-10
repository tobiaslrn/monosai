import { DestroyRef, Directive, ElementRef, inject, input, output, signal } from '@angular/core';
import { AnchoredPlacement } from '../dropdown/anchored-placement';
import { OpenOverlayGuard } from '../dropdown/open-overlay-guard';

let nextPopupId = 0;

/**
 * A floating panel that is a native popover.
 *
 * The browser does the work a menu needs: a press outside and `Escape` dismiss
 * it, `Escape` and `hide()` hand focus back to what had it, and the panel sits in the top layer, so no
 * card's `overflow` clips it and no `z-index` has to out-bid its neighbours. No
 * listener is registered by any instance, which is what lets one live in every
 * row of a virtualised list. It is placed by the rule every dropdown shares
 * (`AnchoredPlacement`), which listens only while the panel is open, and drawn
 * by `_dropdown.scss`.
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
    '[class.mn-popup--menu]': 'menu()',
    '(beforetoggle)': 'onBeforeToggle($event)',
    '(toggle)': 'onToggle()',
    '(keydown)': 'onKeydown($event)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class PopupDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly instance = nextPopupId++;

  readonly id = `mn-popup-${String(this.instance)}`;
  private readonly placement = new AnchoredPlacement({
    panel: this.element,
    trigger: () => document.querySelector(`[popovertarget="${this.id}"]`),
    scroller: () => this.element,
  });
  private readonly guard = new OpenOverlayGuard({
    panel: this.element,
    trigger: () => document.querySelector(`[popovertarget="${this.id}"]`),
    close: () => {
      this.hide();
    },
  });
  /** A list of actions: items are `role="menuitem"` and take the arrow keys. */
  readonly menu = input(false);

  readonly isOpen = signal(false);
  readonly opened = output<void>();
  readonly closed = output<void>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.guard.stop();
    });
  }

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
    const open = (event as ToggleEvent).newState === 'open';
    this.isOpen.set(open);
    if (open) {
      this.placement.open();
      this.guard.start();
    }
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
      this.placement.close();
      this.guard.stop();
      this.closed.emit();
    }
  }

  private isNativeOpen(): boolean {
    return this.element.matches(':popover-open');
  }

  /**
   * A menu is left by Tab as well as by choosing: focus moving on to the page
   * closes it rather than leaving it open over whatever took the focus.
   */
  protected onFocusOut(event: FocusEvent): void {
    const target = event.relatedTarget;
    if (!this.menu() || !(target instanceof Node) || this.element.contains(target)) {
      return;
    }
    if (target instanceof Element && target.closest(`[popovertarget="${this.id}"]`) !== null) {
      return;
    }
    this.hide();
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
  },
})
export class PopupTriggerDirective {
  readonly popup = input.required<PopupDirective>({ alias: 'mnPopupTrigger' });
}
