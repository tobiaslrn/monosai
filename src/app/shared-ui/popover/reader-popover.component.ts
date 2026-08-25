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
  imports: [A11yModule],
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
      }
      <div class="body">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .popover {
      box-sizing: border-box;
      width: min(23rem, calc(100vw - 2 * var(--space-4)));
      max-height: min(28rem, calc(100dvh - 6rem));
      padding: var(--space-4);
      overflow-y: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
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
      max-height: calc(80dvh - var(--mn-docked-player-height, 0px));
      /*
       * The reader's audio player docks to the same edge, and publishes its
       * height on the document root so a sheet can land on top of it rather
       * than under it. Zero whenever nothing else is docked.
       */
      margin-block-end: var(--mn-docked-player-height, 0px);
      padding: 0 var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
      overflow: hidden auto;
      border-inline: 0;
      border-block-end: 0;
      border-radius: var(--radius-card) var(--radius-card) 0 0;
      transition:
        opacity var(--motion-fast) ease-out,
        transform var(--motion-medium) cubic-bezier(0.2, 0, 0, 1);

      @starting-style {
        opacity: 1;
        transform: translateY(100%);
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
    this.card().nativeElement.focus();
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
