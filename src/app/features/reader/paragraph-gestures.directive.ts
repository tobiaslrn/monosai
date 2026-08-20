import { DestroyRef, Directive, ElementRef, HostListener, inject, output } from '@angular/core';
import { sentenceAt, sentenceBoxesIn } from './sentence-hit-testing';

/** How long a touch must rest on a sentence before it is selected. */
const LONG_PRESS_MS = 500;

/** Movement that turns a press into a scroll or a drag rather than a long press. */
const MOVE_TOLERANCE_PX = 10;

/** The selected sentence, and the point its popover is anchored to. */
export interface SentenceSelection {
  readonly sentenceId: string;
  readonly x: number;
  readonly y: number;
}

/**
 * The two pointer routes to a sentence.
 *
 * The reader prints no control for a sentence, so the press has to be the
 * control: a click anywhere in a paragraph that is not a word selects the
 * sentence it fell in or nearest to, and a touch long-press does the same from
 * anywhere in the sentence including on a word.
 *
 * Listening on the paragraph rather than on each sentence is deliberate. A
 * press in the leading between two lines lands on the paragraph and on no
 * sentence element at all, so a per-sentence listener would drop exactly the
 * whitespace that makes this target big enough to hit. `sentenceAt` decides
 * from the line boxes instead.
 *
 * Token buttons stop their own click from propagating, so a click that reaches
 * here is by definition not a word, and opening word details and selecting a
 * sentence can never race. A press that moves, that is interrupted by a scroll,
 * or that ends in a text selection is not a long press: all three are things a
 * reader does while reading.
 */
@Directive({ selector: '[mnParagraphGestures]' })
export class ParagraphGesturesDirective {
  readonly sentenceSelected = output<SentenceSelection>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressOrigin: { x: number; y: number } | null = null;
  private armedSwallow: ((event: Event) => void) | null = null;
  private swallowTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const cancel = (): void => {
      this.cancelPress();
    };
    // Capture, so a scroll inside any container still cancels the press.
    window.addEventListener('scroll', cancel, { capture: true, passive: true });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', cancel, { capture: true });
      this.cancelPress();
      this.disarmSwallow();
    });
  }

  @HostListener('click', ['$event'])
  protected onClick(event: MouseEvent): void {
    // A press that produced a text selection was a reader copying a line, and
    // a click reported at the origin was synthesized rather than aimed — for
    // assistive technology the word buttons are the route in.
    if (hasTextSelection() || (event.clientX === 0 && event.clientY === 0)) {
      return;
    }
    this.select(event.clientX, event.clientY);
  }

  @HostListener('pointerdown', ['$event'])
  protected onPointerDown(event: PointerEvent): void {
    // A new gesture is never the click the previous long press was guarding
    // against, and leaving the guard armed would silently eat it.
    this.disarmSwallow();
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
      this.select(origin.x, origin.y);
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

  private select(x: number, y: number): void {
    const sentenceId = sentenceAt(sentenceBoxesIn(this.element.nativeElement), { x, y });
    if (sentenceId !== null) {
      this.sentenceSelected.emit({ sentenceId, x, y });
    }
  }

  private cancelPress(): void {
    if (this.pressTimer !== null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
    this.pressOrigin = null;
  }

  /**
   * Eats the click a long press produces when the finger is lifted, so that
   * pressing on a word opens the sentence rather than also that word.
   */
  private swallowNextClick(): void {
    const swallow = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      this.disarmSwallow();
    };
    this.armedSwallow = swallow;
    this.element.nativeElement.addEventListener('click', swallow, { capture: true });
    // A long press that never produces a click must not leave the guard armed
    // for the next, genuine one.
    this.swallowTimer = setTimeout(() => {
      this.disarmSwallow();
    }, LONG_PRESS_MS);
  }

  private disarmSwallow(): void {
    if (this.swallowTimer !== null) {
      clearTimeout(this.swallowTimer);
      this.swallowTimer = null;
    }
    if (this.armedSwallow !== null) {
      this.element.nativeElement.removeEventListener('click', this.armedSwallow, {
        capture: true,
      });
      this.armedSwallow = null;
    }
  }
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
}
