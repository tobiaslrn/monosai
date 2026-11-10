import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { AnchoredPlacement } from './anchored-placement';
import { OpenOverlayGuard } from './open-overlay-guard';

interface NativePopoverElement extends Omit<HTMLElement, 'hidePopover' | 'showPopover'> {
  readonly hidePopover?: () => void;
  readonly showPopover?: () => void;
}

let nextDropdownId = 0;

/**
 * The dropdown: the one list that drops from a field to choose a value from.
 * The select (`mn-select`) and the model picker (`mn-model-picker`) are both
 * this, on every screen size — never a bottom sheet, never a centred dialog:
 *
 *   <button … [attr.popovertarget]="list.id">…</button>
 *   <mn-dropdown #list="mnDropdown" label="Voice">
 *     <input mn-dropdown-pinned … />           optional: stays put while the list scrolls
 *     …the rows (`.mn-dropdown-row`)…
 *   </mn-dropdown>
 *
 * It hangs below its field, or above it when the content fits only there, from
 * the field's start edge, at least as wide as the field and growing with its
 * content to `--dropdown-max-width`, held inside the page's column
 * (`AnchoredPlacement`). Its surface, padding, rows and motion are
 * `_dropdown.scss`, which menus share; nothing about it is chosen by the place
 * that uses it.
 *
 * It is a native popover, so a press outside or Escape closes it and focus
 * returns to the field. Back closes it too, rather than leaving the page, and a
 * press outside never also activates what it landed on (`OpenOverlayGuard`). Opening moves focus to its `[data-overlay-focus]`
 * control and holds it inside while it is open.
 */
@Component({
  selector: 'mn-dropdown',
  exportAs: 'mnDropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [CdkTrapFocus],
  host: {
    popover: 'auto',
    class: 'mn-dropdown',
    role: 'dialog',
    '[attr.id]': 'id',
    '[attr.aria-label]': 'label()',
    '(beforetoggle)': 'onBeforeToggle($event)',
    '(toggle)': 'onToggle()',
  },
  template: `
    <div class="mn-dropdown__pinned"><ng-content select="[mn-dropdown-pinned]" /></div>
    <div class="mn-dropdown__scroller">
      <div class="mn-dropdown__content"><ng-content /></div>
    </div>
  `,
})
export class DropdownComponent {
  /** The popover's id, which its field names with `popovertarget`. */
  readonly id = `mn-dropdown-${String(nextDropdownId++)}`;
  /** What is being chosen: the dropdown's accessible name. */
  readonly label = input.required<string>();
  readonly opened = output<void>();
  readonly closed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly trap = inject(CdkTrapFocus);
  private readonly openState = signal(false);
  private readonly placement = new AnchoredPlacement({
    panel: this.host,
    trigger: () => document.querySelector(`[popovertarget="${this.id}"]`),
    scroller: () => this.host.querySelector<HTMLElement>('.mn-dropdown__scroller'),
    maxHeightToken: '--dropdown-max-height',
  });

  private readonly guard = new OpenOverlayGuard({
    panel: this.host,
    trigger: () => document.querySelector(`[popovertarget="${this.id}"]`),
    close: () => {
      this.hide();
    },
  });

  /** Whether it is showing, set before the first frame of showing. */
  readonly isOpen = this.openState.asReadonly();

  constructor() {
    this.trap.enabled = false;
    inject(DestroyRef).onDestroy(() => {
      this.guard.stop();
    });
  }

  show(): void {
    (this.host as NativePopoverElement).showPopover?.();
  }

  hide(): void {
    (this.host as NativePopoverElement).hidePopover?.();
  }

  protected onBeforeToggle(event: Event): void {
    const open = (event as ToggleEvent).newState === 'open';
    this.openState.set(open);
    if (open) {
      this.placement.open();
      this.guard.start();
    }
  }

  /**
   * Whether it is open is read from the element rather than remembered: a
   * panel the browser hides because its node was moved fires no `beforetoggle`
   * the owner could have seen.
   */
  protected onToggle(): void {
    const open = this.host.matches(':popover-open');
    this.openState.set(open);
    this.trap.enabled = open;
    if (open) {
      this.host.querySelector<HTMLElement>('[data-overlay-focus]')?.focus();
      this.opened.emit();
    } else {
      this.placement.close();
      this.guard.stop();
      this.closed.emit();
    }
  }
}
