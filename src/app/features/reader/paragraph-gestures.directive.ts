import { DestroyRef, Directive, ElementRef, HostListener, inject, output } from '@angular/core';
import { sentenceAt, sentenceBoxesIn } from './sentence-hit-testing';

/** How long a touch must rest on a sentence before it is selected. */
const LONG_PRESS_MS = 450;

/** Movement that turns a press into a scroll or a drag rather than a long press. */
const MOVE_TOLERANCE_PX = 10;

/** A short buzz, so a long press is felt rather than waited out. */
const HAPTIC_MS = 12;

/** Marks the sentence a finger is resting on, before the press has resolved. */
const PRESSING_CLASS = 'is-pressing';

/** The selected sentence, and the point its popover is anchored to. */
export interface SentenceSelection {
  readonly sentenceId: string;
  readonly x: number;
  readonly y: number;
}

/**
 * The two pointer routes to a sentence, one per input device.
 *
 * The reader prints no control for a sentence, so the press has to be the
 * control — but the two devices cannot share one gesture. A mouse click
 * anywhere in a paragraph that is not a word selects the sentence it fell in or
 * nearest to, because a mouse has nothing else to do with a click on prose. A
 * finger does: a tap is how a reader dismisses what is open and how they scroll
 * on to the next line, so on touch only a long press selects, from anywhere in
 * the sentence including on a word.
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
  /**
   * The device the pending click belongs to.
   *
   * A click carries no pointer type of its own, and the two devices mean
   * opposite things by one. It starts as a mouse so a click synthesized without
   * any pointer sequence — which is how assistive technology and a keyboard
   * reach the page — still selects.
   */
  private lastPointerType = 'mouse';

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
    // A tap is not a selection. On touch the reader taps to dismiss what is
    // open and to scroll on, so answering a tap with a popover meant every
    // attempt to put one away opened the next one.
    if (this.lastPointerType !== 'mouse') {
      return;
    }
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
    this.lastPointerType = event.pointerType;
    if (event.pointerType === 'mouse') {
      return;
    }
    this.cancelPress();
    this.pressOrigin = { x: event.clientX, y: event.clientY };
    // Answered at once rather than after the delay: half a second of nothing
    // happening under a finger reads as the page having ignored it.
    this.markPressed(sentenceAt(sentenceBoxesIn(this.element.nativeElement), this.pressOrigin));
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      const origin = this.pressOrigin;
      if (origin === null || hasTextSelection()) {
        return;
      }
      this.swallowNextClick();
      buzz();
      this.markPressed(null);
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

  /**
   * Suppresses the platform's own long-press menu on touch.
   *
   * A long press is the reader's gesture for a sentence, and on Android the
   * browser answers the same press with a text-selection menu that covers the
   * popover it just opened.
   */
  @HostListener('contextmenu', ['$event'])
  protected onContextMenu(event: Event): void {
    if (this.lastPointerType !== 'mouse') {
      event.preventDefault();
    }
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
    this.markPressed(null);
  }

  /**
   * Tints the sentence under the finger while the press is being timed.
   *
   * Set on the element rather than through the sentence component, because the
   * sentence a press belongs to is resolved from line boxes here and nowhere
   * else, and a press in the leading belongs to a sentence that is not under
   * the pointer at all.
   */
  private markPressed(sentenceId: string | null): void {
    for (const element of this.element.nativeElement.querySelectorAll<HTMLElement>(
      `.${PRESSING_CLASS}`,
    )) {
      element.classList.remove(PRESSING_CLASS);
    }
    if (sentenceId === null) {
      return;
    }
    this.element.nativeElement
      .querySelector<HTMLElement>(`[data-sentence-id="${CSS.escape(sentenceId)}"]`)
      ?.classList.add(PRESSING_CLASS);
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

/**
 * Confirms a long press where the device can, and does nothing where it cannot.
 *
 * `vibrate` is typed as always present but is absent on iOS Safari and on every
 * desktop browser, so it is feature-detected rather than called.
 */
function buzz(): void {
  if ('vibrate' in navigator) {
    navigator.vibrate(HAPTIC_MS);
  }
}
