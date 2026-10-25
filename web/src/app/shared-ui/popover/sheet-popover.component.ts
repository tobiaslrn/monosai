import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { ViewportService } from '../../core/platform/viewport.service';
import { SheetHandleComponent } from '../sheet/sheet-handle.component';

interface NativePopoverElement extends Omit<HTMLElement, 'hidePopover' | 'showPopover'> {
  readonly hidePopover?: () => void;
  readonly showPopover?: () => void;
}

/**
 * Shared native-popover surface for panels that become bottom sheets on touch.
 *
 * The native popover stays on the host so it can light-dismiss, survive the
 * file chooser, and keep its accessible relationship with its trigger. It owns
 * the placement that used to drift between panels — anchored on a wide screen,
 * docked on a narrow one — and follows the shared grab handle's drag.
 */
@Component({
  selector: 'mn-sheet-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetHandleComponent],
  host: {
    '[class.is-sheet]': 'isMobile()',
    '[class.is-dragging]': 'dragOffset() > 0',
    '[style.transform]': 'dragTransform()',
    '[style.position-anchor]': 'isMobile() ? null : anchorName()',
    '[attr.data-modal]': "modal() ? '' : null",
  },
  template: `
    @if (isMobile()) {
      <mn-sheet-handle #handle [label]="closeLabel()" (dismissed)="closed.emit()" />
    }
    <ng-content />
  `,
  styles: `
    :host {
      position: fixed;
      z-index: 10;
      inset: auto;
      position-area: bottom span-left;
      display: grid;
      gap: var(--space-3);
      box-sizing: border-box;
      width: min(25rem, calc(100vw - 2 * var(--space-4)));
      max-height: calc(100dvh - 6rem);
      margin: var(--space-2) 0 0;
      padding: var(--space-4);
      overflow-y: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sheet);
      background: var(--surface-panel);
      color: var(--text-primary);
      box-shadow: var(--shadow-overlay);
      transition: transform var(--motion-medium) cubic-bezier(0.2, 0, 0, 1);
    }

    :host(:not(:popover-open)) {
      display: none;
    }

    :host(.is-sheet) {
      /* A docked sheet spans the viewport, so it drops the anchor's
         position-area box. Keeping it would inset the sheet to the
         trigger's edge and leave a bare strip down the side. */
      position-area: none;
      inset: auto 0 0;
      width: 100%;
      max-width: none;
      max-height: calc(100dvh - var(--space-4));
      margin: 0;
      padding: 0 var(--space-4) max(var(--space-4), env(safe-area-inset-bottom));
      overflow-y: auto;
      border-width: 1px 0 0;
      border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
      /*
       * Closed, the sheet sits below the edge it docks to: it rises from there
       * when it opens and goes back down the same way, so a dismissal carries
       * on from wherever the finger let go instead of cutting the sheet out
       * from under it. The discrete properties keep it painted and in the top
       * layer until that slide has finished.
       */
      transform: translateY(100%);
      transition:
        transform var(--motion-medium) cubic-bezier(0.3, 0, 0.8, 0.15),
        display var(--motion-medium) allow-discrete,
        overlay var(--motion-medium) allow-discrete;
    }

    /* On its way out it is no longer a surface: a tap lands on the page behind it. */
    :host(.is-sheet:not(:popover-open)) {
      pointer-events: none;
    }

    /* Arriving decelerates and leaving accelerates, as a native sheet does. */
    :host(.is-sheet:popover-open) {
      transform: translateY(0);
      transition-timing-function: cubic-bezier(0.05, 0.7, 0.1, 1);

      @starting-style {
        transform: translateY(100%);
      }
    }

    :host([data-modal])::backdrop {
      background-color: var(--backdrop-scrim);
    }

    /* The scrim fades with the sheet rather than cutting out from behind it. */
    :host(.is-sheet[data-modal])::backdrop {
      transition:
        background-color var(--motion-medium) linear,
        display var(--motion-medium) allow-discrete,
        overlay var(--motion-medium) allow-discrete;
    }

    :host(.is-sheet[data-modal]:not(:popover-open))::backdrop {
      background-color: transparent;
    }

    :host(.is-sheet[data-modal]:popover-open)::backdrop {
      @starting-style {
        background-color: transparent;
      }
    }

    :host(.is-dragging) {
      transition: none;
    }

    mn-sheet-handle {
      --mn-sheet-handle-bleed: var(--space-4);
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      :host(.is-sheet),
      :host(.is-sheet[data-modal])::backdrop {
        transition: none;
      }
    }
  `,
})
export class SheetPopoverComponent {
  /** The anchor name used by the desktop popover placement rule. */
  readonly anchorName = input.required<string>();
  /** Names the action for keyboard and assistive technology users. */
  readonly closeLabel = input('Close');
  /** Adds the native popover backdrop for a modal sheet. */
  readonly modal = input(false);
  /** Emitted when the handle answers a dismissal gesture. */
  readonly closed = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewport = inject(ViewportService);
  private readonly handle = viewChild<SheetHandleComponent>('handle');

  protected readonly isMobile = this.viewport.isMobile;
  protected readonly dragOffset = computed(() => this.handle()?.offset() ?? 0);
  protected readonly dragTransform = computed(() => {
    const offset = this.dragOffset();
    return offset === 0 ? null : `translateY(${String(offset)}px)`;
  });

  /** The native popover element for the owning feature's open/close lifecycle. */
  element(): HTMLElement {
    return this.host.nativeElement;
  }

  isOpen(): boolean {
    return this.host.nativeElement.matches(':popover-open');
  }

  show(): void {
    (this.host.nativeElement as NativePopoverElement).showPopover?.();
  }

  hide(): void {
    this.settleDrag();
    (this.host.nativeElement as NativePopoverElement).hidePopover?.();
  }

  focusHandle(): void {
    this.handle()?.focus();
  }

  /**
   * Ends a drag on the host itself, ahead of the change detection that will do
   * the same.
   *
   * A sheet is usually closed from the gesture that dismissed it, and the
   * browser recalculates style before Angular writes the released state back.
   * It would see a sheet still pinned to the finger and transition-free, and so
   * cut it away instead of sending it down. Writing the settled state here is
   * what the next change detection writes anyway, so the two agree.
   */
  private settleDrag(): void {
    const host = this.host.nativeElement;
    host.classList.remove('is-dragging');
    host.style.removeProperty('transform');
  }
}
