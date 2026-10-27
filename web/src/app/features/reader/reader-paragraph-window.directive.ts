import {
  DestroyRef,
  Directive,
  ElementRef,
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
} from '../../domain/reading/paragraph-window';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import { ReaderScrollService, type DocumentEdge } from './reader-scroll.service';

/** Whatever decides how tall a paragraph is laid out. */
export interface ParagraphLayout {
  /** Changes whenever paragraph heights do; a new key discards every measurement. */
  readonly key: string;
  /** The reading size, which scales the first estimate of a paragraph's height. */
  readonly scale: number;
}

/**
 * The reader's virtual paragraph window, on the element the reading renders in.
 *
 * `ReaderStore` holds which paragraphs are mounted; this keeps the space of the
 * ones that are not, so the scrollbar spans the whole reading, and moves the
 * window when a scroll reaches a paragraph outside it. Heights are measured as
 * paragraphs mount and survive their unmounting, so the spacers become exact
 * for every paragraph the learner has passed.
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
      this.settledLayout();
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
    const next = new Map(this.measured());
    const measured: number[] = [];
    for (const paragraph of this.paragraphs()) {
      const element = paragraph.element().nativeElement;
      const position = paragraph.entry().paragraph.position;
      const margin = Number.parseFloat(getComputedStyle(element).marginBottom) || 0;
      const height = element.getBoundingClientRect().height + margin;
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
    this.scheduleWindowForScroll();
  }

  private scheduleWindowForScroll(): void {
    if (this.windowFrame !== null || this.store.status() !== 'ready') {
      return;
    }
    this.windowFrame = requestAnimationFrame(() => {
      this.windowFrame = null;
      const documentTop = this.host.getBoundingClientRect().top + window.scrollY;
      const offset = window.scrollY + window.innerHeight / 2 - documentTop;
      const position = paragraphAtOffset(
        offset,
        this.store.totalParagraphs(),
        this.estimate(),
        this.measured(),
      );
      const mounted = this.store.window();
      // Never against the way the learner is scrolling: a stale estimate can
      // place the middle of the screen behind a window that is moving away.
      const direction = this.scroll.direction;
      if (
        (direction === 'forward' && position < mounted.first) ||
        (direction === 'backward' && position >= mounted.first + mounted.count)
      ) {
        return;
      }
      if (!windowContains(mounted, position)) {
        void this.store.moveTo(position);
      }
    });
  }

  private async moveToEdge(edge: DocumentEdge): Promise<void> {
    const position = edge === 'start' ? 0 : Math.max(0, this.store.totalParagraphs() - 1);
    await this.store.moveTo(position);
    requestAnimationFrame(() => {
      this.scroll.scrollTo(
        { top: edge === 'start' ? 0 : document.documentElement.scrollHeight },
        'next-frame',
      );
    });
  }
}
