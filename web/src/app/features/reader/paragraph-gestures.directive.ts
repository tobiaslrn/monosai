import { DestroyRef, Directive, ElementRef, HostListener, inject, output } from '@angular/core';
import { sentenceAt, sentenceBoxesIn } from './sentence-hit-testing';

/** The interval in which two touch taps become a sentence gesture. */
export const SENTENCE_DOUBLE_TAP_WINDOW_MS = 300;

/** The furthest apart two taps may land and still mean the same gesture. */
export const SENTENCE_DOUBLE_TAP_DISTANCE_PX = 24;

/** Movement beyond a tap's radius is a scroll or a drag, not a tap. */
const TOUCH_TAP_MOVE_TOLERANCE_PX = SENTENCE_DOUBLE_TAP_DISTANCE_PX;

/** A synthesized click should never be mistaken for a later touch click. */
const TOUCH_CLICK_CANDIDATE_WINDOW_MS = SENTENCE_DOUBLE_TAP_WINDOW_MS + 50;

/** The selected sentence, and the point its popover is anchored to. */
export interface SentenceSelection {
  readonly sentenceId: string;
  readonly x: number;
  readonly y: number;
}

interface TouchPointer {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  moved: boolean;
}

interface TouchClickCandidate {
  readonly sentenceId: string | null;
  readonly target: HTMLElement | null;
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

/**
 * Resolves paragraph gestures without taking over the browser's text
 * selection.
 *
 * A mouse click on prose still selects its sentence immediately. A touch tap
 * has two possible meanings: a single tap opens a word, while two taps close
 * together on one sentence open sentence details. A word tap is answered at
 * once — the tap is the whole of what most reading asks for, and holding it
 * back made every word feel like it had to be asked for twice. The paragraph
 * instead remembers where the tap landed: a second tap inside the gesture
 * window replaces the word with its sentence, and the click that would have
 * put the word away again is consumed. Taps in the whitespace between words
 * have nothing to activate and are captured as before. Native keyboard
 * activation never has a touch pointer candidate and therefore stays
 * immediate.
 *
 * Listening at paragraph level is deliberate. A tap in the leading between
 * lines lands on the paragraph rather than on a sentence element, so
 * `sentenceAt` remains the authority for the geometric sentence boundary.
 */
@Directive({ selector: '[mnParagraphGestures]' })
export class ParagraphGesturesDirective {
  readonly sentenceSelected = output<SentenceSelection>();

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly touchPointerIds = new Set<number>();
  private activeTouch: TouchPointer | null = null;
  private ignoredTouchPointerId: number | null = null;
  private touchClickCandidate: TouchClickCandidate | null = null;
  private touchCandidateTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTap: TouchClickCandidate | null = null;
  private pendingTapTimer: ReturnType<typeof setTimeout> | null = null;
  private touchClicksToSuppress = 0;
  private mousePressOrigin: { x: number; y: number } | null = null;
  private mouseDragged = false;

  private readonly onClickCapture = (event: MouseEvent): void => {
    const candidate = this.touchClickCandidate;
    if (candidate === null || Date.now() - candidate.at > TOUCH_CLICK_CANDIDATE_WINDOW_MS) {
      if (this.touchClicksToSuppress > 0) {
        this.touchClicksToSuppress -= 1;
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    this.touchClickCandidate = null;
    this.clearTouchCandidateTimer();

    // A native selection wins over every application gesture. Consuming this
    // click also prevents a button under the selected text from activating.
    if (hasTextSelection()) {
      this.cancelTouchActions(1);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const target = elementTarget(event.target) ?? candidate.target;
    const sentenceId = this.sentenceFor(target, candidate.x, candidate.y);
    if (sentenceId === null) {
      return;
    }

    this.handleTouchTap(
      {
        sentenceId,
        target,
        x: candidate.x,
        y: candidate.y,
        at: candidate.at,
      },
      event,
    );
  };

  private readonly onWindowPointerDown = (event: PointerEvent): void => {
    if (!isTouchPointer(event.pointerType)) {
      // A mouse on a hybrid device is a new modality, not the second half of
      // a touch gesture that happened just before it.
      this.cancelTouchActions(0);
      this.touchClicksToSuppress = 0;
      return;
    }
    const startsNewTouchSequence = this.touchPointerIds.size === 0;
    this.touchPointerIds.add(event.pointerId);
    if (startsNewTouchSequence) {
      // A cancelled/dragged touch may have left one synthesized click to
      // swallow. A genuinely new touch sequence must never inherit it,
      // including when that sequence starts outside this paragraph.
      this.touchClicksToSuppress = 0;
    }
    // A second touch anywhere in the document invalidates the first gesture.
    // Do this in capture so a second finger outside this paragraph cannot leave
    // a delayed word click armed here.
    if (this.touchPointerIds.size > 1) {
      this.cancelTouchActions(2);
      this.ignoredTouchPointerId = event.pointerId;
    }
  };

  private readonly onWindowPointerCancel = (event: PointerEvent): void => {
    if (isTouchPointer(event.pointerType)) {
      this.touchPointerIds.delete(event.pointerId);
      this.cancelTouchActions(this.hasTouchGesture() ? 1 : 0);
    }
  };

  private readonly onWindowPointerUp = (event: PointerEvent): void => {
    if (isTouchPointer(event.pointerType)) {
      this.touchPointerIds.delete(event.pointerId);
      if (event.pointerId === this.ignoredTouchPointerId) {
        this.ignoredTouchPointerId = null;
      }
    }
  };

  private readonly onScroll = (): void => {
    this.cancelTouchActions(this.hasTouchGesture() ? 1 : 0);
  };

  private readonly onSelectionChange = (): void => {
    if (hasTextSelection()) {
      this.cancelTouchActions(this.hasTouchGesture() ? 1 : 0);
    }
  };

  private readonly onSelectStart = (): void => {
    // Chromium emits selectstart for an ordinary touch activation before its
    // synthesized click, even when the selection remains collapsed. Defer the
    // check until the browser has had a chance to publish a real range; the
    // selectionchange listener remains the authoritative cancellation path.
    queueMicrotask(() => {
      if (hasTextSelection()) {
        this.cancelTouchActions(this.hasTouchGesture() ? 1 : 0);
      }
    });
  };

  private readonly onWindowKeyDown = (): void => {
    // Keyboard activation has no pointer sequence of its own. Clear a touch
    // candidate before its click arrives so it cannot be mistaken for tap two.
    this.cancelTouchActions(0);
    this.touchClicksToSuppress = 0;
  };

  constructor() {
    const paragraph = this.element.nativeElement;
    paragraph.addEventListener('click', this.onClickCapture, { capture: true });
    window.addEventListener('pointerdown', this.onWindowPointerDown, { capture: true });
    window.addEventListener('pointercancel', this.onWindowPointerCancel, { capture: true });
    window.addEventListener('pointerup', this.onWindowPointerUp, { capture: true });
    window.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    document.addEventListener('selectionchange', this.onSelectionChange);
    document.addEventListener('selectstart', this.onSelectStart);
    window.addEventListener('keydown', this.onWindowKeyDown, { capture: true });

    this.destroyRef.onDestroy(() => {
      paragraph.removeEventListener('click', this.onClickCapture, { capture: true });
      window.removeEventListener('pointerdown', this.onWindowPointerDown, { capture: true });
      window.removeEventListener('pointercancel', this.onWindowPointerCancel, { capture: true });
      window.removeEventListener('pointerup', this.onWindowPointerUp, { capture: true });
      window.removeEventListener('scroll', this.onScroll, { capture: true });
      document.removeEventListener('selectionchange', this.onSelectionChange);
      document.removeEventListener('selectstart', this.onSelectStart);
      window.removeEventListener('keydown', this.onWindowKeyDown, { capture: true });
      this.cancelTouchActions();
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
    // A click at the origin is the coordinate-free activation synthesized by
    // assistive technology. Word buttons and the visible sentence-action
    // route own that keyboard path; guessing from paragraph geometry would
    // open an arbitrary sentence.
    if (hasTextSelection() || (event.clientX === 0 && event.clientY === 0)) {
      return;
    }
    this.select(event.clientX, event.clientY);
  }

  @HostListener('pointerdown', ['$event'])
  protected onPointerDown(event: PointerEvent): void {
    if (isTouchPointer(event.pointerType)) {
      if (
        (!event.isPrimary && this.activeTouch !== null) ||
        this.ignoredTouchPointerId === event.pointerId
      ) {
        this.ignoredTouchPointerId = null;
        this.cancelTouchActions(2);
        return;
      }
      this.touchClicksToSuppress = 0;
      this.activeTouch = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      return;
    }
    this.mousePressOrigin = { x: event.clientX, y: event.clientY };
    this.mouseDragged = false;
  }

  @HostListener('pointermove', ['$event'])
  protected onPointerMove(event: PointerEvent): void {
    if (isTouchPointer(event.pointerType)) {
      const active = this.activeTouch;
      if (active?.pointerId !== event.pointerId) {
        return;
      }
      if (movedBeyond(active, event)) {
        active.moved = true;
        this.cancelTouchActions(this.hasTouchGesture() ? 1 : 0);
      }
      return;
    }
    const origin = this.mousePressOrigin;
    if (origin) {
      this.mouseDragged ||= movedBeyond(origin, event);
    }
  }

  @HostListener('pointerup', ['$event'])
  protected onPointerUp(event: PointerEvent): void {
    if (!isTouchPointer(event.pointerType)) {
      this.mousePressOrigin = null;
      return;
    }
    const active = this.activeTouch;
    this.activeTouch = null;
    if (active?.pointerId !== event.pointerId) {
      return;
    }
    if (active.moved) {
      return;
    }
    const target = elementTarget(event.target);
    const candidate: TouchClickCandidate = {
      sentenceId: this.sentenceFor(target, event.clientX, event.clientY),
      target,
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
    };
    this.touchClickCandidate = candidate;
    this.clearTouchCandidateTimer();
    this.touchCandidateTimer = setTimeout(() => {
      if (this.touchClickCandidate === candidate) {
        this.touchClickCandidate = null;
      }
      this.touchCandidateTimer = null;
    }, TOUCH_CLICK_CANDIDATE_WINDOW_MS);
  }

  @HostListener('pointercancel', ['$event'])
  protected onPointerCancel(event: PointerEvent): void {
    if (isTouchPointer(event.pointerType)) {
      this.cancelTouchActions(this.hasTouchGesture() ? 1 : 0);
    } else {
      this.mousePressOrigin = null;
      this.mouseDragged = false;
    }
  }

  /** Picks the second tap's sentence from its target or from line geometry. */
  private sentenceFor(target: HTMLElement | null, x: number, y: number): string | null {
    return (
      target?.closest<HTMLElement>('[data-sentence-id]')?.dataset['sentenceId'] ??
      sentenceAt(sentenceBoxesIn(this.element.nativeElement), { x, y })
    );
  }

  /**
   * Decides what one synthesized touch click means.
   *
   * The second tap of a gesture is the only one this consumes: it turns into
   * sentence details, and swallowing its click is what keeps the word it
   * landed on from being toggled shut underneath the sheet that replaces it.
   * A first tap on a word is left entirely alone, so the word opens on the
   * press the reader actually made.
   */
  private handleTouchTap(candidate: TouchClickCandidate, event: MouseEvent): void {
    if (candidate.sentenceId === null) {
      return;
    }
    const pending = this.pendingTap;
    if (
      pending !== null &&
      pending.sentenceId === candidate.sentenceId &&
      withinDistance(pending, candidate)
    ) {
      this.clearPendingTap();
      event.preventDefault();
      event.stopPropagation();
      this.sentenceSelected.emit({
        sentenceId: candidate.sentenceId,
        x: candidate.x,
        y: candidate.y,
      });
      return;
    }

    this.pendingTap = candidate;
    this.clearPendingTapTimer();
    this.pendingTapTimer = setTimeout(() => {
      this.clearPendingTap();
    }, SENTENCE_DOUBLE_TAP_WINDOW_MS);

    if (isWordTarget(candidate.target)) {
      return;
    }
    // Whitespace, punctuation, and furigana have nothing of their own to open.
    // Their click must not reach the paragraph's mouse route, which would
    // select the sentence on a single tap.
    event.preventDefault();
    event.stopPropagation();
  }

  private select(x: number, y: number): void {
    const sentenceId = sentenceAt(sentenceBoxesIn(this.element.nativeElement), { x, y });
    if (sentenceId !== null) {
      this.sentenceSelected.emit({ sentenceId, x, y });
    }
  }

  private cancelTouchActions(clicksToSuppress = 0): void {
    this.activeTouch = null;
    this.ignoredTouchPointerId = null;
    this.touchClicksToSuppress = Math.max(this.touchClicksToSuppress, clicksToSuppress);
    this.touchClickCandidate = null;
    this.clearTouchCandidateTimer();
    this.clearPendingTap();
  }

  /**
   * True while a touch is still owed a click.
   *
   * An armed gesture window is deliberately not part of this. Its tap has
   * already had its click, and counting it would have a scroll swallow the
   * next unrelated tap.
   */
  private hasTouchGesture(): boolean {
    return (
      this.touchPointerIds.size > 0 ||
      this.activeTouch !== null ||
      this.touchClickCandidate !== null
    );
  }

  private clearPendingTap(): void {
    this.pendingTap = null;
    this.clearPendingTapTimer();
  }

  private clearPendingTapTimer(): void {
    if (this.pendingTapTimer !== null) {
      clearTimeout(this.pendingTapTimer);
      this.pendingTapTimer = null;
    }
  }

  private clearTouchCandidateTimer(): void {
    if (this.touchCandidateTimer !== null) {
      clearTimeout(this.touchCandidateTimer);
      this.touchCandidateTimer = null;
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
    Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > TOUCH_TAP_MOVE_TOLERANCE_PX
  );
}

function withinDistance(first: TouchClickCandidate, second: TouchClickCandidate): boolean {
  return (
    Math.hypot(second.x - first.x, second.y - first.y) <= SENTENCE_DOUBLE_TAP_DISTANCE_PX &&
    second.at - first.at <= SENTENCE_DOUBLE_TAP_WINDOW_MS
  );
}

function isWordTarget(target: HTMLElement | null): boolean {
  return (target?.closest('button.token') ?? null) !== null;
}

function elementTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
}
