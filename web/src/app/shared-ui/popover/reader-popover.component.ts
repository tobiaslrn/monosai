import { A11yModule } from '@angular/cdk/a11y';
import type { AfterViewInit, ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ViewportService } from '../../core/platform/viewport.service';
import { IconComponent } from '../icon/icon.component';

/** How far a sheet must be dragged down before letting go dismisses it. */
const DISMISS_DISTANCE_PX = 80;

/**
 * The card every floating reader surface is rendered in.
 *
 * One component for word details and the sentence menu alike: they differ in
 * content, not in how they behave. Focus moves to the card and is trapped while
 * it is open, which is what makes a floating surface usable with a keyboard or
 * a screen reader; `PopoverService` owns dismissal and returning focus.
 *
 * On a phone the card docks to the bottom edge as a sheet. An anchored card has
 * nowhere to go on a narrow screen: it lands on the words it explains, is
 * pushed half off the viewport when the press was near an edge, and leaves no
 * empty page to tap to dismiss it. Docked, it is always in the same place, at a
 * size it chooses, with the reading still visible above it. The sheet carries a
 * grab handle and can be flicked down, because that is what a sheet on a phone
 * is expected to do.
 */
@Component({
  selector: 'mn-reader-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, IconComponent],
  host: { '[class.is-sheet]': 'isSheet()' },
  template: `
    <div
      #card
      class="popover"
      role="dialog"
      tabindex="-1"
      [attr.aria-label]="label()"
      [style.transform]="dragTransform()"
      [class.is-dragging]="dragOffset() > 0"
      cdkTrapFocus
    >
      @if (isSheet()) {
        <!--
          The grab handle is the sheet's affordance and its dismissal: a press
          anywhere on it can be flicked down, and a plain press on it closes.
          It is a real button, so the gesture is never the only way out.
        -->
        <button
          type="button"
          class="handle"
          aria-label="Close"
          (pointerdown)="onDragStart($event)"
          (pointermove)="onDragMove($event)"
          (pointerup)="onDragEnd()"
          (pointercancel)="onDragEnd()"
          (click)="onHandleClick()"
        >
          <span class="grip" aria-hidden="true"></span>
        </button>
      } @else {
        <!--
          An anchored card closes from its own top corner, the way every card
          does. A full-size labelled button was taking a row of its own at the
          head of the content, so the first thing in a word lookup was a control
          rather than the word.
        -->
        <button type="button" class="close" aria-label="Close" (click)="closed.emit()">
          <mn-icon name="close" [size]="16" />
        </button>
      }
      <div class="body">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .popover {
      position: relative;
      box-sizing: border-box;
      width: min(23rem, calc(100vw - 2 * var(--space-4)));
      max-height: min(28rem, calc(100dvh - 6rem));
      padding: var(--space-4);
      overflow-y: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sheet);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
      transition: opacity var(--motion-fast) ease-out;

      @starting-style {
        opacity: 0;
      }
    }

    /*
     * A docked sheet: full width, its own scroll, and clear of the home
     * indicator. Padding rather than margin at the bottom, so a flick that
     * drags it down never uncovers the canvas behind it.
     */
    :host(.is-sheet) .popover {
      width: 100vw;
      max-width: 100%;
      /*
       * The sheet gets the smaller of its normal viewport cap and the space
       * that actually remains above the measured player boundary. The player
       * height is not subtracted from the cap itself: doing that made a short
       * player needlessly shrink an otherwise comfortable sheet.
       *
       * Half the viewport rather than more. A sheet is read against the
       * sentence it is about, and one that took most of the screen left the
       * reading it explains as a strip above it — which is the same failure as
       * covering the line outright, reached politely.
       */
      max-height: min(50dvh, calc(100dvh - var(--mn-docked-player-height, 0px) - var(--space-4)));
      /*
       * The reader's audio player docks to the same edge, and publishes its
       * height on the document root. The global pane uses that value as its
       * bottom position, while this card leaves the standard gap above that
       * boundary. Both resolve to zero whenever nothing else is docked.
       */
      padding: 0 var(--space-4) max(var(--space-4), env(safe-area-inset-bottom));
      overflow: hidden auto;
      border-inline: 0;
      border-block-end: 0;
      border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
      transition:
        opacity var(--motion-fast) ease-out,
        transform var(--motion-medium) cubic-bezier(0.2, 0, 0, 1);

      @starting-style {
        opacity: 1;
        transform: translateY(100%);
      }
    }

    /*
     * In the corner rather than in the flow: it overlaps the card's own padding,
     * so it costs no vertical space and the content still starts at the top.
     * Quiet until it is wanted, and never on a sheet, where the grab handle is
     * both the affordance and the way out.
     */
    .close {
      position: absolute;
      z-index: 2;
      /*
       * Aligned to the card's own padding and as tall as the controls a card
       * puts on its first row, so the two share a centre line instead of the
       * close floating above and beside whatever it sits next to.
       */
      top: var(--space-4);
      right: var(--space-4);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: var(--touch-target);
      padding: 0;
      border: 0;
      border-radius: var(--radius-control);
      background: none;
      color: var(--text-secondary);
      cursor: pointer;
      transition: background-color var(--motion-fast) ease-out;
    }

    .close:hover {
      background: var(--surface-sunken);
      color: var(--text-primary);
    }

    .close:focus-visible {
      outline: 2px solid var(--action-primary);
      outline-offset: 2px;
    }

    /*
     * How much room the card's leading row has to leave for that control.
     * Published rather than applied here: only the row the button actually
     * overlaps should be inset, and padding the whole body would pull the
     * sentence card's full-bleed action tray off its own edge.
     */
    .popover {
      /* The control's own width, and a gap the size of the card's other gaps. */
      --mn-popover-close-inset: calc(1.75rem + var(--space-3));
    }

    :host(.is-sheet) .popover {
      --mn-popover-close-inset: 0px;
    }

    @media (prefers-reduced-motion: reduce) {
      .close {
        transition: none;
      }
    }

    /*
     * The card takes focus when it opens, so that a screen reader hears what
     * appeared before it hears the first thing inside it — but it is a
     * container rather than a control, and a ring drawn around the whole
     * surface after a tap reads as a rendering fault rather than as focus.
     * Every control inside it keeps its own ring, which is where a keyboard
     * lands on the first Tab.
     */
    .popover:focus,
    .popover:focus-visible {
      outline: none;
    }

    /* The drag follows the finger exactly; only letting go is animated. */
    :host(.is-sheet) .popover.is-dragging {
      transition: none;
    }

    /*
     * Sticky, so the way out stays reachable while the sheet's own content is
     * scrolled — which is most of the point of docking it.
     */
    .handle {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      width: calc(100% + 2 * var(--space-4));
      min-height: var(--touch-target);
      margin-inline: calc(-1 * var(--space-4));
      padding: 0;
      border: 0;
      background: var(--surface-panel);
      cursor: grab;
      touch-action: none;
    }

    .grip {
      display: block;
      width: 2.5rem;
      height: 4px;
      border-radius: var(--radius-pill);
      background: var(--border-strong);
      opacity: 0.6;
    }

    .handle:active .grip {
      opacity: 1;
    }

    @media (prefers-reduced-motion: reduce) {
      .popover,
      :host(.is-sheet) .popover {
        transition: none;
      }
    }
  `,
})
export class ReaderPopoverComponent implements AfterViewInit {
  /** Names the dialog, because the card itself carries no visible heading. */
  readonly label = input.required<string>();
  /** Anchored cards opt out; a sheet is the default below the desktop width. */
  readonly mobileSheet = input(true);

  /** Asked for by the sheet's handle. `PopoverService` owns what closing means. */
  readonly closed = output<void>();

  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');
  private readonly viewport = inject(ViewportService);

  protected readonly isSheet = computed(() => this.mobileSheet() && this.viewport.isMobile());

  private readonly dragOffsetSignal = signal(0);
  protected readonly dragOffset = this.dragOffsetSignal.asReadonly();
  protected readonly dragTransform = computed(() => {
    const offset = this.dragOffsetSignal();
    return offset === 0 ? null : `translateY(${String(offset)}px)`;
  });

  private dragStartY: number | null = null;
  /** Set by a drag, so the click a release produces is not a second dismissal. */
  private dragged = false;

  /**
   * Focus starts on the card rather than on its first control, so a screen
   * reader hears what opened before it hears the first thing inside it. The
   * focus trap then keeps focus here until the popover closes.
   */
  ngAfterViewInit(): void {
    // Without `preventScroll` the browser scrolls the docked card into view as
    // it takes focus, which on a phone moves the reading behind it.
    this.card().nativeElement.focus({ preventScroll: true });
  }

  protected onDragStart(event: PointerEvent): void {
    this.dragStartY = event.clientY;
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  protected onDragMove(event: PointerEvent): void {
    if (this.dragStartY === null) {
      return;
    }
    // Downwards only: dragging a docked sheet up would lift it off the edge it
    // is docked to and leave a gap under it.
    const offset = Math.max(0, event.clientY - this.dragStartY);
    if (offset > 0) {
      this.dragged = true;
    }
    this.dragOffsetSignal.set(offset);
  }

  protected onDragEnd(): void {
    const dismissed = this.dragOffsetSignal() >= DISMISS_DISTANCE_PX;
    this.dragStartY = null;
    this.dragOffsetSignal.set(0);
    if (dismissed) {
      this.closed.emit();
    }
  }

  /**
   * A press on the handle that was not a drag closes the sheet.
   *
   * A drag that fell short of the threshold has already answered the gesture by
   * springing back, and the click its release produces must not close what the
   * reader just decided to keep.
   */
  protected onHandleClick(): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    this.closed.emit();
  }
}
