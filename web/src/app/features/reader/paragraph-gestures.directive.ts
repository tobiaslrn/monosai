import { DestroyRef, Directive, ElementRef, HostListener, inject, output } from '@angular/core';
import { consumePointerGesture, releasePointerGesture } from '../../core/platform/pointer-gestures';
import { sentenceAt, sentenceBoxesIn } from './sentence-hit-testing';

/** How long a finger must rest on a line before it opens sentence details. */
export const SENTENCE_LONG_PRESS_MS = 450;

/** Movement beyond this is a scroll or a drag, and never a press. */
export const SENTENCE_LONG_PRESS_MOVE_PX = 10;

/** How long a touch release keeps owning the click the browser makes from it. */
const TOUCH_CLICK_WINDOW_MS = 400;

/** How the sentence was chosen, so a repeat can mean different things per device. */
export type SelectionModality = 'touch' | 'mouse';

/** The selected sentence, and the point its popover is anchored to. */
export interface SentenceSelection {
  readonly sentenceId: string;
  readonly x: number;
  readonly y: number;
  readonly modality: SelectionModality;
}

/** Where a press is, and how far along the way to being a long press it got. */
interface TouchPress {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  phase: 'waiting' | 'held' | 'cancelled';
}

/**
 * Resolves paragraph gestures.
 *
 * Touch and mouse ask for a sentence differently, because they are different
 * instruments. A mouse click on prose selects immediately: a click on Japanese
 * has no other meaning to a pointer that is already precise. A finger holds the
 * line for {@link SENTENCE_LONG_PRESS_MS} instead, and the press is answered
 * while the finger is still down, so the gesture confirms itself.
 *
 * The short tap is left entirely alone. It belongs to whatever it landed on: a
 * word button opens its own details through an ordinary click, and a tap that
 * lands on nothing is a dismissal the open surface answers. Nothing here delays
 * a tap, counts taps, or holds a click back to find out whether a second one
 * follows — that ambiguity was the whole of what made reading on a phone
 * unpredictable.
 *
 * Only the release of a press that already fired is consumed, and only for that
 * one pointer: the click a browser makes from it would otherwise re-open the
 * word underneath the sheet that just replaced it.
 *
 * Listening at paragraph level is deliberate. A press in the leading between
 * lines lands on the paragraph rather than on a sentence element, so
 * `sentenceAt` remains the authority for the geometric sentence boundary.
 */
@Directive({ selector: '[mnParagraphGestures]' })
export class ParagraphGesturesDirective {
  readonly sentenceSelected = output<SentenceSelection>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Every touch pointer currently down anywhere, so a second finger is seen. */
  private readonly touchPointerIds = new Set<number>();
  private press: TouchPress | null = null;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  /** The pointer whose synthesized click a fired long press still owns. */
  private consumedClickPointerId: number | null = null;
  private consumedClickTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set between a touch release and the click it produces, or its expiry. */
  private touchClickPending = false;
  private touchClickTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPointerWasTouch = false;
  private mousePressOrigin: { x: number; y: number } | null = null;
  private mouseDragged = false;

  /**
   * Swallows exactly the click a fired long press produced.
   *
   * In capture at paragraph level, so it never reaches the word button under
   * the finger. Every other touch click passes through untouched.
   */
  private readonly onClickCapture = (event: MouseEvent): void => {
    if (this.consumedClickPointerId === null) {
      return;
    }
    this.clearConsumedClick();
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onWindowPointerDown = (event: PointerEvent): void => {
    releasePointerGesture(event.pointerId);
    this.lastPointerWasTouch = isTouchPointer(event.pointerType);
    if (!this.lastPointerWasTouch) {
      // A mouse on a hybrid device is a new modality, not the continuation of
      // a touch gesture that happened just before it.
      this.cancelPress();
      return;
    }
    this.touchPointerIds.add(event.pointerId);
    // A second touch anywhere in the document is a pinch or a two-finger
    // scroll. Seen in capture, so a finger landing outside this paragraph
    // cancels the press being held inside it.
    if (this.touchPointerIds.size > 1) {
      this.cancelPress();
    }
  };

  private readonly onWindowPointerUp = (event: PointerEvent): void => {
    if (!isTouchPointer(event.pointerType)) {
      return;
    }
    this.touchPointerIds.delete(event.pointerId);
    this.armTouchClickWindow();
    const press = this.press;
    if (press?.pointerId !== event.pointerId) {
      return;
    }
    this.press = null;
    this.clearPressTimer();
    if (press.phase === 'held') {
      // The gesture is over and was answered while the finger was still down.
      // Its release, and the click made from it, belong to nothing.
      this.consumeClickFor(event.pointerId);
    }
  };

  private readonly onWindowPointerCancel = (event: PointerEvent): void => {
    if (isTouchPointer(event.pointerType)) {
      this.touchPointerIds.delete(event.pointerId);
    }
    this.cancelPress();
  };

  /** A scroll before the press fires means the finger was moving the page. */
  private readonly onScroll = (): void => {
    if (this.press?.phase === 'waiting') {
      this.cancelPress();
    }
  };

  /** A press cannot outlive the window that was holding it. */
  private readonly onWindowBlur = (): void => {
    this.touchPointerIds.clear();
    this.cancelPress();
  };

  private readonly onWindowKeyDown = (): void => {
    // Keyboard activation has no pointer sequence of its own, and must never be
    // read as the click a touch release was still owed.
    this.cancelPress();
    this.clearConsumedClick();
    this.clearTouchClickWindow();
    this.lastPointerWasTouch = false;
  };

  constructor() {
    const paragraph = this.element.nativeElement;
    paragraph.addEventListener('click', this.onClickCapture, { capture: true });
    window.addEventListener('pointerdown', this.onWindowPointerDown, { capture: true });
    window.addEventListener('pointercancel', this.onWindowPointerCancel, { capture: true });
    window.addEventListener('pointerup', this.onWindowPointerUp, { capture: true });
    window.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('keydown', this.onWindowKeyDown, { capture: true });

    this.destroyRef.onDestroy(() => {
      paragraph.removeEventListener('click', this.onClickCapture, { capture: true });
      window.removeEventListener('pointerdown', this.onWindowPointerDown, { capture: true });
      window.removeEventListener('pointercancel', this.onWindowPointerCancel, { capture: true });
      window.removeEventListener('pointerup', this.onWindowPointerUp, { capture: true });
      window.removeEventListener('scroll', this.onScroll, { capture: true });
      window.removeEventListener('blur', this.onWindowBlur);
      window.removeEventListener('keydown', this.onWindowKeyDown, { capture: true });
      // A paragraph can be unmounted mid-press by the reading window moving.
      this.cancelPress();
      this.clearConsumedClick();
      this.clearTouchClickWindow();
    });
  }

  /** Mouse prose remains an immediate sentence target. */
  @HostListener('click', ['$event'])
  protected onClick(event: MouseEvent): void {
    const followedDrag = this.mouseDragged;
    this.mouseDragged = false;
    if (followedDrag && event.detail > 0) {
      return;
    }
    // A touch click means whatever its own target means. The line underneath it
    // is reached by holding, never by tapping, so a tap on the leading or on
    // punctuation opens nothing and is left to dismiss what is already open.
    if (this.touchClickPending) {
      return;
    }
    // A click at the origin is the coordinate-free activation synthesized by
    // assistive technology. Word buttons and the visible sentence-details
    // route own that keyboard path; guessing from paragraph geometry would
    // open an arbitrary sentence.
    if (hasTextSelection() || (event.clientX === 0 && event.clientY === 0)) {
      return;
    }
    this.select(event.clientX, event.clientY, 'mouse');
  }

  /**
   * Keeps the platform's own long-press callout off the reading surface.
   *
   * Only for a finger, and only here: the same press is the application's
   * sentence gesture, and two menus cannot answer one press. A mouse keeps its
   * context menu, and every other surface — details included — keeps both
   * selection and the menu.
   */
  @HostListener('contextmenu', ['$event'])
  protected onContextMenu(event: Event): void {
    if (this.lastPointerWasTouch) {
      event.preventDefault();
    }
  }

  @HostListener('pointerdown', ['$event'])
  protected onPointerDown(event: PointerEvent): void {
    if (!isTouchPointer(event.pointerType)) {
      this.mousePressOrigin = { x: event.clientX, y: event.clientY };
      this.mouseDragged = false;
      return;
    }
    if (this.touchPointerIds.size > 1) {
      this.cancelPress();
      return;
    }
    this.clearConsumedClick();
    const target = elementTarget(event.target);
    const press: TouchPress = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      phase: 'waiting',
    };
    this.press = press;
    this.clearPressTimer();
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      this.hold(press, target);
    }, SENTENCE_LONG_PRESS_MS);
  }

  @HostListener('pointermove', ['$event'])
  protected onPointerMove(event: PointerEvent): void {
    if (!isTouchPointer(event.pointerType)) {
      const origin = this.mousePressOrigin;
      if (origin) {
        this.mouseDragged ||= movedBeyond(origin, event);
      }
      return;
    }
    const press = this.press;
    if (press?.pointerId === event.pointerId && movedBeyond(press, event)) {
      this.cancelPress();
    }
  }

  @HostListener('pointerup', ['$event'])
  protected onPointerUp(event: PointerEvent): void {
    if (!isTouchPointer(event.pointerType)) {
      this.mousePressOrigin = null;
    }
  }

  @HostListener('pointercancel', ['$event'])
  protected onPointerCancel(event: PointerEvent): void {
    if (!isTouchPointer(event.pointerType)) {
      this.mousePressOrigin = null;
      this.mouseDragged = false;
    }
  }

  /** The moment a waiting press becomes sentence details, under the finger. */
  private hold(press: TouchPress, target: HTMLElement | null): void {
    if (this.press !== press || press.phase !== 'waiting') {
      return;
    }
    const sentenceId = this.sentenceFor(target, press.x, press.y);
    if (sentenceId === null) {
      press.phase = 'cancelled';
      return;
    }
    press.phase = 'held';
    // Before the surface opens, so the release this press is heading for cannot
    // be read by the popover's outside-press rule as a dismissal.
    consumePointerGesture(press.pointerId);
    this.sentenceSelected.emit({ sentenceId, x: press.x, y: press.y, modality: 'touch' });
  }

  /** Picks the pressed sentence from its target or from line geometry. */
  private sentenceFor(target: HTMLElement | null, x: number, y: number): string | null {
    return (
      target?.closest<HTMLElement>('[data-sentence-id]')?.dataset['sentenceId'] ??
      sentenceAt(sentenceBoxesIn(this.element.nativeElement), { x, y })
    );
  }

  private select(x: number, y: number, modality: SelectionModality): void {
    const sentenceId = sentenceAt(sentenceBoxesIn(this.element.nativeElement), { x, y });
    if (sentenceId !== null) {
      this.sentenceSelected.emit({ sentenceId, x, y, modality });
    }
  }

  private cancelPress(): void {
    const press = this.press;
    if (press !== null) {
      press.phase = 'cancelled';
    }
    this.press = null;
    this.clearPressTimer();
  }

  private consumeClickFor(pointerId: number): void {
    this.clearConsumedClick();
    this.consumedClickPointerId = pointerId;
    this.consumedClickTimer = setTimeout(() => {
      this.consumedClickTimer = null;
      this.consumedClickPointerId = null;
    }, TOUCH_CLICK_WINDOW_MS);
  }

  private armTouchClickWindow(): void {
    this.touchClickPending = true;
    this.clearTouchClickTimer();
    this.touchClickTimer = setTimeout(() => {
      this.touchClickTimer = null;
      this.touchClickPending = false;
    }, TOUCH_CLICK_WINDOW_MS);
  }

  private clearTouchClickWindow(): void {
    this.touchClickPending = false;
    this.clearTouchClickTimer();
  }

  private clearTouchClickTimer(): void {
    if (this.touchClickTimer !== null) {
      clearTimeout(this.touchClickTimer);
      this.touchClickTimer = null;
    }
  }

  private clearConsumedClick(): void {
    this.consumedClickPointerId = null;
    if (this.consumedClickTimer !== null) {
      clearTimeout(this.consumedClickTimer);
      this.consumedClickTimer = null;
    }
  }

  private clearPressTimer(): void {
    if (this.pressTimer !== null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }
}

function isTouchPointer(pointerType: string): boolean {
  return pointerType !== 'mouse';
}

function movedBeyond(
  origin: { readonly x: number; readonly y: number },
  event: PointerEvent,
): boolean {
  return (
    Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > SENTENCE_LONG_PRESS_MOVE_PX
  );
}

function elementTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
}
