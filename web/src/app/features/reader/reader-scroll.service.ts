import { DestroyRef, Injectable, Renderer2, inject } from '@angular/core';

/**
 * How long a smooth scroll is allowed to keep emitting events before a scroll
 * counts as the learner's again. Generous, because a smooth scroll's duration
 * is the browser's to choose and treating our own scroll as theirs would turn
 * following off after the very first advance.
 */
export const SCROLL_SETTLE_MS = 1000;

export type ScrollDirection = 'backward' | 'forward';

export type DocumentEdge = 'start' | 'end';

/**
 * When a programmatic scroll stops counting as ours: once a smooth scroll has
 * had time to settle, or on the next frame for an instant jump.
 */
export type ScrollRelease = 'settled' | 'next-frame';

/**
 * The reader's window: every scroll, resize, and Home/End press it reacts to.
 *
 * It tells a scroll the learner made from one the reader made itself, which is
 * what playback following and sheet clearance both hinge on. A scroll the
 * learner made turns following off - they have said where they want to look -
 * and only an explicit Play, Next, or Previous turns it back on
 * (`ai-pipelines.md` section 11).
 *
 * Provided by the reader page, so its listeners live exactly as long as it.
 */
@Injectable()
export class ReaderScrollService {
  private readonly scrollListeners: ((byLearner: boolean) => void)[] = [];
  private readonly resizeListeners: (() => void)[] = [];
  private readonly edgeListeners: ((edge: DocumentEdge) => void)[] = [];

  /** True while our own scroll is emitting scroll events. */
  private programmatic = false;
  private release: (() => void) | null = null;
  private followingValue = true;
  private lastScrollY = window.scrollY;
  private directionValue: ScrollDirection | null = null;

  constructor() {
    const renderer = inject(Renderer2);
    const scrolled = (): void => {
      this.scrolled();
    };
    const unlisten = [
      renderer.listen('window', 'scroll', scrolled, { passive: true }),
      renderer.listen('window', 'wheel', scrolled, { passive: true }),
      renderer.listen('window', 'touchmove', scrolled, { passive: true }),
      renderer.listen(
        'window',
        'resize',
        () => {
          for (const listener of this.resizeListeners) listener();
        },
        { passive: true },
      ),
      renderer.listen('window', 'keydown', (event: KeyboardEvent) => {
        this.keydown(event);
      }),
    ];
    inject(DestroyRef).onDestroy(() => {
      for (const stop of unlisten) stop();
      this.release?.();
    });
  }

  /** Whether playback may scroll the page to the sentence it has reached. */
  get following(): boolean {
    return this.followingValue;
  }

  /** The way the learner last scrolled, or null before they have. */
  get direction(): ScrollDirection | null {
    return this.directionValue;
  }

  /** An explicit Play, Next, or Previous: the learner wants to be taken along again. */
  resumeFollowing(): void {
    this.followingValue = true;
  }

  /**
   * Called on every scroll, with whether the learner made it. Wheel and touch
   * moves count too, even at an edge that cannot scroll any further: they are
   * the learner saying where they want to look. Returns the unsubscribe.
   */
  onScroll(listener: (byLearner: boolean) => void): () => void {
    return subscribe(this.scrollListeners, listener);
  }

  onResize(listener: () => void): () => void {
    return subscribe(this.resizeListeners, listener);
  }

  /** Called when Home or End asks for an edge of the whole reading. */
  onEdge(listener: (edge: DocumentEdge) => void): () => void {
    return subscribe(this.edgeListeners, listener);
  }

  /** Scrolls the window without the scroll counting as the learner's. */
  scrollTo(options: ScrollToOptions, release: ScrollRelease = 'settled'): void {
    this.guard(release);
    window.scrollTo(options);
  }

  /** Scrolls an element into view without the scroll counting as the learner's. */
  scrollIntoView(element: HTMLElement, options: ScrollIntoViewOptions): void {
    this.guard('settled');
    element.scrollIntoView(options);
  }

  private guard(release: ScrollRelease): void {
    this.release?.();
    this.programmatic = true;
    const done = (): void => {
      this.programmatic = false;
      this.release = null;
    };
    if (release === 'settled') {
      const timer = setTimeout(done, SCROLL_SETTLE_MS);
      this.release = () => {
        clearTimeout(timer);
        done();
      };
    } else {
      const frame = requestAnimationFrame(done);
      this.release = () => {
        cancelAnimationFrame(frame);
        done();
      };
    }
  }

  private scrolled(): void {
    // Only a scroll the learner made themselves counts. A programmatic one
    // sets its own guard, so following never switches itself off.
    const byLearner = !this.programmatic;
    if (byLearner) {
      this.followingValue = false;
      if (window.scrollY > this.lastScrollY + 1) {
        this.directionValue = 'forward';
      } else if (window.scrollY < this.lastScrollY - 1) {
        this.directionValue = 'backward';
      }
    }
    this.lastScrollY = window.scrollY;
    for (const listener of this.scrollListeners) listener(byLearner);
  }

  private keydown(event: KeyboardEvent): void {
    if (
      (event.key !== 'Home' && event.key !== 'End') ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable)
    ) {
      return;
    }
    event.preventDefault();
    const edge = event.key === 'End' ? 'end' : 'start';
    for (const listener of this.edgeListeners) listener(edge);
  }
}

function subscribe<T>(listeners: T[], listener: T): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}
