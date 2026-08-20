import { DestroyRef, Directive, ElementRef, HostListener, inject, output } from '@angular/core';

/** How long a touch must rest on a sentence before its menu opens. */
const LONG_PRESS_MS = 500;

/** Movement that turns a press into a scroll or a drag rather than a long press. */
const MOVE_TOLERANCE_PX = 10;

/** Where the sentence menu should be anchored, in viewport coordinates. */
export interface SentenceGesture {
  readonly x: number;
  readonly y: number;
}

/**
 * What the menu is anchored to: the pointer, or the sentence itself when the
 * activation carried no position — a click synthesized by assistive technology
 * reports (0, 0), and a menu in the corner of the window is not an answer.
 */
export type SentenceGestureOrigin = SentenceGesture | HTMLElement;

/**
 * The two pointer routes into the sentence menu.
 *
 * Desktop clicks the sentence's whitespace — punctuation, the gaps between
 * words, the space at the end of a line. Token buttons stop their own click
 * from propagating, so a click that reaches this directive is by definition not
 * a word, and opening word details and the sentence menu can never race.
 *
 * Touch long-presses anywhere in the sentence, including on a word. The click
 * that a long press produces afterwards is swallowed in the capture phase, so
 * pressing on a word opens the menu and not that word's details.
 *
 * A press that moves, that is interrupted by a scroll, or that ends in a text
 * selection is not a long press: all three are things a reader does while
 * reading, and none of them is a request for a menu.
 */
@Directive({ selector: '[mnSentenceGestures]' })
export class SentenceGesturesDirective {
  readonly menuRequested = output<SentenceGestureOrigin>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressOrigin: SentenceGesture | null = null;

  constructor() {
    const cancel = (): void => {
      this.cancelPress();
    };
    // Capture, so a scroll inside any container still cancels the press.
    window.addEventListener('scroll', cancel, { capture: true, passive: true });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', cancel, { capture: true });
      this.cancelPress();
    });
  }

  @HostListener('click', ['$event'])
  protected onClick(event: MouseEvent): void {
    if (hasTextSelection()) {
      return;
    }
    const positioned = event.clientX !== 0 || event.clientY !== 0;
    this.menuRequested.emit(
      positioned ? { x: event.clientX, y: event.clientY } : this.element.nativeElement,
    );
  }

  @HostListener('pointerdown', ['$event'])
  protected onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      return;
    }
    this.cancelPress();
    this.pressOrigin = { x: event.clientX, y: event.clientY };
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      const origin = this.pressOrigin;
      if (origin === null || hasTextSelection()) {
        return;
      }
      this.swallowNextClick();
      this.menuRequested.emit(origin);
    }, LONG_PRESS_MS);
  }

  @HostListener('pointermove', ['$event'])
  protected onPointerMove(event: PointerEvent): void {
    const origin = this.pressOrigin;
    if (origin === null) {
      return;
    }
    const moved =
      Math.abs(event.clientX - origin.x) > MOVE_TOLERANCE_PX ||
      Math.abs(event.clientY - origin.y) > MOVE_TOLERANCE_PX;
    if (moved) {
      this.cancelPress();
    }
  }

  @HostListener('pointerup')
  @HostListener('pointercancel')
  protected onPointerEnd(): void {
    this.cancelPress();
  }

  private cancelPress(): void {
    if (this.pressTimer !== null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
    this.pressOrigin = null;
  }

  private swallowNextClick(): void {
    const swallow = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    this.element.nativeElement.addEventListener('click', swallow, {
      capture: true,
      once: true,
    });
    // A long press that never produces a click must not leave the listener
    // armed for the next, genuine one.
    setTimeout(() => {
      this.element.nativeElement.removeEventListener('click', swallow, { capture: true });
    }, LONG_PRESS_MS);
  }
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
}
