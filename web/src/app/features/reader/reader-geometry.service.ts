import type { ElementRef, Signal } from '@angular/core';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { ReaderAudioStore } from '../../application/reading/reader-audio.store';
import { ViewportService } from '../../core/platform/viewport.service';
import type { SentenceId } from '../../domain/shared/ids';
import type { PopoverRef } from '../../shared-ui/popover/popover.service';
import { ReaderScrollService } from './reader-scroll.service';

/**
 * How much of the reading is kept between a sheet and the word it explains.
 *
 * A word butted against the sheet's edge reads as being underneath it; a line
 * of breathing room is what makes it look deliberately left visible.
 */
export const SHEET_CLEARANCE = 12;

/**
 * How tall the docked player currently is, published on the document root.
 *
 * The overlay a sheet is rendered into is a sibling of the reader, so this is
 * the only place both of them can read.
 */
export const DOCKED_PLAYER_HEIGHT = '--mn-docked-player-height';

/** The page's own furniture, as the reader page renders it. */
export interface ReaderElements {
  /** The sticky header: the top of what is left of the window to read in. */
  readonly bar: Signal<ElementRef<HTMLElement> | undefined>;
  /** The page heading the bar takes over once it has scrolled beneath it. */
  readonly title: Signal<ElementRef<HTMLElement> | undefined>;
  /** Everything the reading itself is rendered in. */
  readonly content: Signal<ElementRef<HTMLElement> | undefined>;
}

/** What an open sheet is about, and the surface that is covering it. */
interface SheetSubject {
  readonly anchor: HTMLElement;
  readonly surface: PopoverRef;
  /** Where the press landed, so a wrapped sentence clears the pressed line. */
  readonly pressedAtY: number | null;
}

/**
 * Where the reader's furniture is, and keeping what the learner is reading out
 * from under it.
 *
 * The sticky bar, the docked player, and a details sheet all cover part of the
 * window. This measures them, publishes the player's height for the sheet,
 * scrolls a pressed word clear of the sheet that explains it, and follows the
 * sentence being read aloud into the band between bar and player.
 *
 * Provided by the reader page, which hands over its elements with `connect`.
 */
@Injectable()
export class ReaderGeometryService {
  private readonly viewport = inject(ViewportService);
  private readonly scroll = inject(ReaderScrollService);
  private readonly audio = inject(ReaderAudioStore);

  private readonly elements = signal<ReaderElements | null>(null);
  private readonly bar = computed(() => this.elements()?.bar()?.nativeElement);
  private readonly title = computed(() => this.elements()?.title()?.nativeElement);
  private readonly content = computed(() => this.elements()?.content()?.nativeElement);

  private player: HTMLElement | null = null;
  /** Keeps the docked sheet clear of the docked player as the player resizes. */
  private playerObserver: ResizeObserver | null = null;

  private subject: SheetSubject | null = null;
  /** Watches an open sheet, so a growing one never covers its own subject. */
  private sheetObserver: ResizeObserver | null = null;
  private sheetCheck: (() => void) | null = null;
  private sheetFrame: number | null = null;
  private sheetScrollFrame: number | null = null;
  private readonly sheetReserve = signal(0);
  /** The navigation count the follow state was last reconciled against. */
  private lastNavigation = 0;

  /**
   * Temporary room below the last line, so a sheet opened over the end of a
   * reading still has somewhere to scroll the pressed line to.
   */
  readonly sheetScrollReserve = computed(() => `${String(this.sheetReserve())}px`);

  /** Whether the page heading has scrolled beneath the bar, which then carries it. */
  private readonly titleTuckedSignal = signal(false);
  readonly titleTucked = this.titleTuckedSignal.asReadonly();

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Stops correcting the scroll position once the reader has moved it. The
    // sheet stays exactly where it is; only the correction ends. Left armed, a
    // reader who scrolled back a paragraph with a sheet open was pulled
    // forwards again to the line they had pressed, over and over.
    destroyRef.onDestroy(
      this.scroll.onScroll((byLearner) => {
        if (byLearner && this.subject !== null) {
          this.releaseSheet();
        }
      }),
    );
    destroyRef.onDestroy(
      this.scroll.onResize(() => {
        this.rearmSheet();
      }),
    );

    effect(() => {
      // Follow the sentence being read, but only into view and only while the
      // learner has not scrolled away themselves.
      const navigation = this.audio.playback.explicitNavigation();
      if (navigation !== this.lastNavigation) {
        this.lastNavigation = navigation;
        this.scroll.resumeFollowing();
      }
      const sentenceId = this.audio.playback.currentSentenceId();
      if (sentenceId !== null && this.scroll.following) {
        queueMicrotask(() => {
          this.revealSentence(sentenceId);
        });
      }
    });

    effect((onCleanup) => {
      // The bar takes over the title once the heading is wholly beneath it.
      // The bar is measured rather than assumed: a maintenance notice grows it.
      const title = this.title();
      const bar = this.bar();
      if (title === undefined || bar === undefined) {
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            // Gone above the bar, not merely out of view below the fold.
            const barBottom = entry.rootBounds?.top ?? bar.offsetHeight;
            this.titleTuckedSignal.set(
              !entry.isIntersecting && entry.boundingClientRect.bottom <= barBottom,
            );
          }
        },
        { rootMargin: `-${String(bar.offsetHeight)}px 0px 0px 0px` },
      );
      observer.observe(title);
      onCleanup(() => {
        observer.disconnect();
      });
    });

    destroyRef.onDestroy(() => {
      this.releaseSheet();
      this.detachPlayer();
    });
  }

  connect(elements: ReaderElements): void {
    this.elements.set(elements);
  }

  /** A mounted sentence by id, or null when it is outside the mounted window. */
  sentenceElement(sentenceId: SentenceId): HTMLElement | null {
    return (
      this.content()?.querySelector<HTMLElement>(
        `[data-sentence-id="${CSS.escape(sentenceId)}"]`,
      ) ?? null
    );
  }

  /** Which side of a sentence its details get first choice of. */
  placementFor(origin: { x: number; y: number } | HTMLElement): 'above' | 'below' {
    const y = origin instanceof HTMLElement ? origin.getBoundingClientRect().top : origin.y;
    return y < window.innerHeight / 2 ? 'above' : 'below';
  }

  /**
   * Publishes how tall the player is, for anything else docked to the bottom.
   *
   * On a phone both the player and a details sheet dock to the bottom edge, and
   * the sheet has no other way to know what it is landing on. Measured rather
   * than assumed, because the player is a transport in one state and a
   * generation panel in another.
   */
  attachPlayer(shell: HTMLElement): void {
    this.playerObserver?.disconnect();
    this.player = shell;
    const publish = (): void => {
      document.documentElement.style.setProperty(
        DOCKED_PLAYER_HEIGHT,
        `${String(Math.round(shell.getBoundingClientRect().height))}px`,
      );
      this.scheduleSheetCheck();
    };
    publish();
    this.playerObserver = new ResizeObserver(publish);
    this.playerObserver.observe(shell);
  }

  /** Gives the bottom edge back once the player is gone. */
  detachPlayer(shell?: HTMLElement): void {
    if (shell !== undefined && shell !== this.player) {
      return;
    }
    this.playerObserver?.disconnect();
    this.playerObserver = null;
    this.player = null;
    document.documentElement.style.removeProperty(DOCKED_PLAYER_HEIGHT);
    this.scheduleSheetCheck();
  }

  /**
   * Scrolls the word or line a sheet is about back into what is left of the
   * page.
   *
   * A sheet docks over the bottom of the screen, so on a phone the press that
   * opened it is as often as not underneath it — details about a word the
   * reader can no longer see, in a sentence they can no longer read. Nothing
   * happens on a desktop, where the card is anchored beside its word, or when
   * the subject is already clear of the sheet.
   */
  keepClearOfSheet(anchor: HTMLElement | null, surface: PopoverRef, pressedAtY?: number): void {
    this.releaseSheet();
    this.subject = anchor === null ? null : { anchor, surface, pressedAtY: pressedAtY ?? null };
    this.armSheet();
  }

  /** Ends the clearance for whatever sheet was open, and hands back its room. */
  releaseSheet(): void {
    this.clearSheetObserver();
    this.subject = null;
  }

  private armSheet(): void {
    const subject = this.subject;
    if (subject === null || !this.viewport.isMobile()) {
      return;
    }
    // After the frame the sheet is laid out in: it is the sheet's own top edge
    // that has to be cleared, and it has none until it has been rendered.
    this.sheetFrame = requestAnimationFrame(() => {
      this.sheetFrame = null;
      if (this.subject !== subject || !this.viewport.isMobile() || !subject.surface.isSheet()) {
        return;
      }
      const { anchor } = subject;
      const sheet = subject.surface.pane;
      // A sentence can wrap across half a screen, and only the line that was
      // actually pressed has to stay visible. Held as an index rather than a
      // coordinate, so it survives the scrolling this is about to do.
      const line = lineIndexAt(anchor, subject.pressedAtY);
      let scrolled = false;
      let target = window.scrollY;
      const clear = (): void => {
        const overlap =
          lineBottom(anchor, line) - sheet.getBoundingClientRect().top + SHEET_CLEARANCE;
        // Resolved to a position rather than a distance, so a measurement taken
        // while a smooth scroll is still running does not ask for the same
        // distance twice.
        const wanted = window.scrollY + overlap;
        if (overlap <= 0 || wanted <= target + 1) {
          return;
        }
        target = wanted;
        // At the end of a reading there is nothing left to scroll into, so the
        // room the pressed line needs is reserved temporarily and handed back
        // when the sheet closes.
        const reachable =
          document.documentElement.scrollHeight - window.innerHeight - this.sheetReserve();
        this.sheetReserve.set(Math.max(0, Math.ceil(target - reachable)));
        const behavior = scrolled || this.viewport.prefersReducedMotion() ? 'auto' : 'smooth';
        scrolled = true;
        // After the reserve has been laid out: scrolling to a position the
        // document does not have yet simply lands short of it.
        this.sheetScrollFrame = requestAnimationFrame(() => {
          this.sheetScrollFrame = null;
          // The first move is the one the reader sees answer their press. A
          // correction after the sheet has grown is not a second journey.
          this.scroll.scrollTo({ top: target, behavior });
        });
      };
      this.sheetCheck = clear;
      // A sheet is as tall as what it has to say, and it has nothing to say
      // until a lookup or a stored translation has arrived: measuring only once
      // would clear an edge the sheet is about to grow past. The observer
      // reports the first size as well, so this is also the initial check.
      this.sheetObserver = new ResizeObserver(clear);
      this.sheetObserver.observe(sheet);
      if (this.player !== null) {
        this.sheetObserver.observe(this.player);
      }
    });
  }

  private rearmSheet(): void {
    if (this.subject === null) {
      return;
    }
    this.clearSheetObserver();
    this.armSheet();
  }

  private clearSheetObserver(): void {
    if (this.sheetFrame !== null) {
      cancelAnimationFrame(this.sheetFrame);
      this.sheetFrame = null;
    }
    if (this.sheetScrollFrame !== null) {
      cancelAnimationFrame(this.sheetScrollFrame);
      this.sheetScrollFrame = null;
    }
    this.sheetReserve.set(0);
    this.sheetObserver?.disconnect();
    this.sheetObserver = null;
    this.sheetCheck = null;
  }

  /** Re-measures the shared sheet/player boundary after layout settles. */
  private scheduleSheetCheck(): void {
    if (this.sheetCheck === null || this.sheetFrame !== null) {
      return;
    }
    this.sheetFrame = requestAnimationFrame(() => {
      this.sheetFrame = null;
      this.sheetCheck?.();
    });
  }

  /**
   * What is left of the viewport once the reader's own furniture is subtracted.
   *
   * The sticky header and the docked player are both opaque and both fixed, so
   * the part of the window a sentence can actually be read in is the band
   * between them. Measured rather than assumed: the header grows with a long
   * title on a narrow screen, and the player is docked flush on a phone and
   * floating clear of the edge on a desktop.
   */
  private readableBand(): { readonly top: number; readonly bottom: number } {
    const bar = this.bar()?.getBoundingClientRect();
    const player = this.player?.getBoundingClientRect();
    return {
      top: Math.max(0, bar?.bottom ?? 0),
      bottom: Math.min(window.innerHeight, player?.top ?? window.innerHeight),
    };
  }

  /**
   * Brings the sentence being read into view, and only if it is not already.
   *
   * Scrolling a sentence that is already on screen would jerk the page on every
   * advance, which is exactly the behaviour that makes a follow-along player
   * unusable. A sentence outside the mounted window has no element yet and is
   * simply left alone.
   *
   * "On screen" is the band between the header and the player, not the window.
   * Measured against the window, a sentence sitting behind the docked player
   * counted as visible and was never scrolled to — so following a reading
   * downwards stopped at the first sentence to reach the player and left the
   * learner watching a sentence they could not see.
   */
  private revealSentence(sentenceId: SentenceId): void {
    const element = this.sentenceElement(sentenceId);
    if (element === null) {
      return;
    }
    const box = element.getBoundingClientRect();
    const band = this.readableBand();
    if (box.top >= band.top && box.bottom <= band.bottom) {
      return;
    }
    this.scroll.scrollIntoView(element, {
      block: 'center',
      behavior: this.viewport.prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }
}

/** Which line box of a wrapped element a press landed in, or -1 for none. */
function lineIndexAt(element: HTMLElement, pressedAtY: number | null): number {
  const rects = [...element.getClientRects()];
  if (pressedAtY === null || rects.length < 2) {
    return -1;
  }
  return rects.findIndex((rect) => pressedAtY >= rect.top && pressedAtY <= rect.bottom);
}

/** The bottom of that line, or of the whole element when no one line applies. */
function lineBottom(element: HTMLElement, line: number): number {
  const rect = line >= 0 ? element.getClientRects()[line] : undefined;
  return rect?.bottom ?? element.getBoundingClientRect().bottom;
}
