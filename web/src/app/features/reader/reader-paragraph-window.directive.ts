import {
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  contentChildren,
  effect,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { ReaderStore } from '../../application/reading/reader.store';
import {
  DEFAULT_PARAGRAPH_HEIGHT_PX,
  paragraphAtOffset,
  paragraphSpacers,
  windowContains,
  windowEnd,
} from '../../domain/reading/paragraph-window';
import { ReaderGeometryService } from './reader-geometry.service';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import {
  ReaderScrollService,
  type DocumentEdge,
  type ScrollDirection,
} from './reader-scroll.service';
import { ReaderWordPreviewService } from './reader-word-preview.service';

/** Whatever decides how tall a paragraph is laid out. */
export interface ParagraphLayout {
  /** Changes whenever paragraph heights do; a new key discards every measurement. */
  readonly key: string;
  /** The reading size, which scales the first estimate of a paragraph's height. */
  readonly scale: number;
}

/** The point of the reading at the middle of the screen. */
interface ReadingAnchor {
  readonly position: number;
  /** How far through the paragraph that point is, from 0 to 1. */
  readonly fraction: number;
}

/**
 * The reader's virtual paragraph window, on the element the reading renders in.
 *
 * `ReaderStore` holds which paragraphs are mounted; this keeps the space of the
 * ones that are not, so the scrollbar spans the whole reading, and moves the
 * window when a scroll reaches a paragraph outside it. Heights are measured as
 * paragraphs mount and survive their unmounting, so the spacers become exact
 * for every paragraph the learner has passed. A new layout keeps the passage at
 * the middle of the screen where it was, and a word that had focus when the
 * window left it hands focus to a word on the screen.
 *
 * Paragraphs are loaded by position from storage rather than held as a list,
 * which is why this does not share the library's item-keyed virtual list.
 */
@Directive({ selector: '[mnReaderParagraphWindow]', exportAs: 'paragraphWindow' })
export class ReaderParagraphWindowDirective {
  readonly layout = input.required<ParagraphLayout>({ alias: 'mnReaderParagraphWindow' });

  private readonly store = inject(ReaderStore);
  private readonly scroll = inject(ReaderScrollService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly geometry = inject(ReaderGeometryService);
  private readonly wordPreview = inject(ReaderWordPreviewService);
  private readonly paragraphs = contentChildren(ReaderParagraphComponent, { descendants: true });

  /** The layout, changing only when its key does. */
  private readonly settledLayout = computed(() => this.layout(), {
    equal: (previous, next) => previous.key === next.key,
  });
  /** Paragraph heights by position, kept while the layout stays the same. */
  private readonly measured = linkedSignal<ParagraphLayout, ReadonlyMap<number, number>>({
    source: this.settledLayout,
    computation: () => new Map(),
  });
  /** The height assumed for a paragraph that has never been measured. */
  private readonly estimate = linkedSignal<ParagraphLayout, number>({
    source: this.settledLayout,
    computation: (layout) => DEFAULT_PARAGRAPH_HEIGHT_PX * layout.scale,
  });
  private windowFrame: number | null = null;
  private laidOutKey: string | null = null;
  /** Where the learner is, as of the last frame that looked. Null at the very top. */
  private anchor: ReadingAnchor | null = null;
  /** Where a new layout has to put the learner back; the window waits until it has. */
  private restoring: ReadingAnchor | null = null;
  /** What had focus inside the reading as the last window move took effect, if anything did. */
  private focusedBeforeMove: HTMLElement | null = null;

  /** Space standing in for the paragraphs before and after the mounted window. */
  readonly spacers = computed(() =>
    paragraphSpacers(
      this.store.window(),
      this.store.totalParagraphs(),
      this.estimate(),
      this.measured(),
    ),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(
      this.scroll.onScroll(() => {
        this.scheduleWindowForScroll();
      }),
    );
    destroyRef.onDestroy(
      this.scroll.onEdge((edge) => {
        void this.moveToEdge(edge);
      }),
    );

    effect((onCleanup) => {
      // Whenever what is mounted, or how it is laid out, has changed: after the
      // frame it is rendered in, when it has a height to measure.
      this.store.paragraphs();
      const { key } = this.settledLayout();
      if (this.laidOutKey !== null && this.laidOutKey !== key) {
        // A fresh object, so a restore already waiting on the old layout stands down.
        const anchor = this.restoring ?? this.anchor;
        this.restoring = anchor && { ...anchor };
      }
      this.laidOutKey = key;
      const frame = requestAnimationFrame(() => {
        this.measureMountedParagraphs();
      });
      onCleanup(() => {
        cancelAnimationFrame(frame);
      });
    });

    destroyRef.onDestroy(() => {
      if (this.windowFrame !== null) {
        cancelAnimationFrame(this.windowFrame);
      }
    });
  }

  private measureMountedParagraphs(): void {
    this.handOnFocus();
    const next = new Map(this.measured());
    const measured: number[] = [];
    for (const paragraph of this.paragraphs()) {
      const position = paragraph.entry().paragraph.position;
      const { height } = this.paragraphBox(paragraph);
      if (Number.isFinite(position) && height > 0) {
        next.set(position, height);
        measured.push(height);
      }
    }
    if (measured.length === 0) {
      return;
    }
    this.measured.set(next);
    if (next.size === measured.length) {
      this.estimate.set(measured.reduce((total, height) => total + height, 0) / measured.length);
    }
    if (this.restoring === null) {
      this.scheduleWindowForScroll();
    } else {
      this.restoreAnchor(this.restoring);
    }
  }

  /** A paragraph's place on the screen, counting the gap below it. */
  private paragraphBox(paragraph: ReaderParagraphComponent): { top: number; height: number } {
    const element = paragraph.element().nativeElement;
    const margin = Number.parseFloat(getComputedStyle(element).marginBottom) || 0;
    const { top, height } = element.getBoundingClientRect();
    return { top, height: height + margin };
  }

  /** Keeps the last known place when the middle of the screen shows a spacer. */
  private anchorAtMiddle(): ReadingAnchor | null {
    if (window.scrollY <= 0) {
      return null;
    }
    const middle = window.innerHeight / 2;
    for (const paragraph of this.paragraphs()) {
      const { top, height } = this.paragraphBox(paragraph);
      if (height > 0 && top <= middle && middle < top + height) {
        return {
          position: paragraph.entry().paragraph.position,
          fraction: (middle - top) / height,
        };
      }
    }
    return this.anchor;
  }

  /**
   * Runs once the anchor's paragraph is mounted and measured, and after the
   * spacers those measurements resize have rendered: scrolling any sooner would
   * aim at a document that is about to change height again.
   */
  private restoreAnchor(anchor: ReadingAnchor): void {
    if (!windowContains(this.store.window(), anchor.position)) {
      void this.store.moveTo(anchor.position).then(() => {
        this.rememberFocus();
      });
      return;
    }
    afterNextRender(
      {
        read: () => {
          if (this.restoring !== anchor) {
            return;
          }
          const paragraph = this.paragraphs().find(
            (candidate) => candidate.entry().paragraph.position === anchor.position,
          );
          if (paragraph === undefined) {
            return;
          }
          const { top, height } = this.paragraphBox(paragraph);
          this.restoring = null;
          this.scroll.scrollTo(
            { top: window.scrollY + top + anchor.fraction * height - window.innerHeight / 2 },
            'next-frame',
          );
          // The screen may now show paragraphs on either side of the anchor.
          this.placeWindow(null);
        },
      },
      { injector: this.injector },
    );
  }

  private scheduleWindowForScroll(): void {
    if (this.windowFrame !== null || this.store.status() !== 'ready') {
      return;
    }
    this.windowFrame = requestAnimationFrame(() => {
      this.windowFrame = null;
      if (this.restoring !== null) {
        return;
      }
      this.anchor = this.anchorAtMiddle();
      this.placeWindow(this.scroll.direction);
    });
  }

  /**
   * Moves the window when the screen shows a spacer on the side it is heading
   * for, so neither edge of the screen is ever left blank.
   *
   * Never against the way the learner is scrolling: a stale estimate can place
   * the far edge of the screen behind a window that is moving away.
   */
  private placeWindow(direction: ScrollDirection | null): void {
    const documentTop = this.host.getBoundingClientRect().top + window.scrollY;
    const paragraphAt = (screenY: number): number =>
      paragraphAtOffset(
        window.scrollY + screenY - documentTop,
        this.store.totalParagraphs(),
        this.estimate(),
        this.measured(),
      );
    const first = paragraphAt(0);
    const last = paragraphAt(window.innerHeight);
    const mounted = this.store.window();
    if (
      (direction !== 'backward' && last >= windowEnd(mounted)) ||
      (direction !== 'forward' && first < mounted.first)
    ) {
      void this.store.cover(first, paragraphAt(window.innerHeight / 2), last).then(() => {
        this.rememberFocus();
      });
    }
  }

  /**
   * Called as a move resolves: the store has the new paragraphs and nothing has
   * rendered them yet, so this is what has focus at the moment of any unmount.
   */
  private rememberFocus(): void {
    const active = document.activeElement;
    const inReading = this.paragraphs().some((paragraph) =>
      paragraph.element().nativeElement.contains(active),
    );
    this.focusedBeforeMove = inReading ? (active as HTMLElement) : null;
  }

  /**
   * An element that leaves the document drops focus to the body, and the next
   * Tab would then start from wherever the document ends up. The first word
   * clear of the sticky bar carries on instead, without scrolling the learner to
   * it and without opening the preview a focused word otherwise shows.
   */
  private handOnFocus(): void {
    const previous = this.focusedBeforeMove;
    if (previous === null) {
      return;
    }
    if (previous.isConnected) {
      if (document.activeElement !== previous) {
        this.focusedBeforeMove = null;
      }
      return;
    }
    this.focusedBeforeMove = null;
    if (document.activeElement !== document.body && document.activeElement !== null) {
      return;
    }
    const words = [...this.host.querySelectorAll<HTMLElement>('button.token')];
    const barBottom = this.geometry.barBottom();
    const word = words.find((candidate) => candidate.getBoundingClientRect().top >= barBottom);
    this.wordPreview.withoutPreview(() => {
      (word ?? words.at(-1))?.focus({ preventScroll: true });
    });
  }

  private async moveToEdge(edge: DocumentEdge): Promise<void> {
    const position = edge === 'start' ? 0 : Math.max(0, this.store.totalParagraphs() - 1);
    await this.store.moveTo(position);
    this.rememberFocus();
    requestAnimationFrame(() => {
      this.scroll.scrollTo(
        { top: edge === 'start' ? 0 : document.documentElement.scrollHeight },
        'next-frame',
      );
    });
  }
}
