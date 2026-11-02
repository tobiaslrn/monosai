import {
  ChangeDetectionStrategy,
  Component,
  signal,
  type TemplateRef,
  type ViewContainerRef,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { ReaderParagraph } from '../../application/reading/reader.store';
import { ReaderStore } from '../../application/reading/reader.store';
import {
  DEFAULT_PARAGRAPH_HEIGHT_PX,
  type ParagraphWindowState,
} from '../../domain/reading/paragraph-window';
import { paragraphId, readingId } from '../../domain/shared/ids';
import { ReaderSelectionStore } from '../../application/reading/reader-selection.store';
import { PopoverService } from '../../shared-ui/popover/popover.service';
import { ReaderGeometryService } from './reader-geometry.service';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import {
  ReaderParagraphWindowDirective,
  type ParagraphLayout,
} from './reader-paragraph-window.directive';
import { ReaderScrollService } from './reader-scroll.service';
import { PREVIEW_DELAY_MS, ReaderWordPreviewService } from './reader-word-preview.service';
import type { TokenActivation } from './reader-sentence.component';

const READING_ID = readingId('r1');

function paragraph(position: number): ReaderParagraph {
  return {
    paragraph: {
      id: paragraphId(`p${String(position)}`),
      readingId: READING_ID,
      position,
      sourceText: '',
    },
    sentences: [],
  };
}

const store = {
  status: signal<'ready' | 'loading'>('ready'),
  window: signal<ParagraphWindowState>({ first: 3, count: 2 }),
  totalParagraphs: signal(10),
  paragraphs: signal<readonly ReaderParagraph[]>([paragraph(3), paragraph(4)]),
  moveTo: vi.fn(() => Promise.resolve()),
  cover: vi.fn(() => Promise.resolve()),
};

const geometry = { barBottom: vi.fn(() => 0) };
const popover = { open: vi.fn(() => ({ close: vi.fn() })) };

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderParagraphWindowDirective, ReaderParagraphComponent],
  providers: [ReaderScrollService, ReaderWordPreviewService],
  template: `
    <div [mnReaderParagraphWindow]="layout()" #paragraphWindow="paragraphWindow">
      <p class="before">{{ paragraphWindow.spacers().before }}</p>
      <p class="after">{{ paragraphWindow.spacers().after }}</p>
      @for (entry of paragraphs(); track entry.paragraph.id) {
        <mn-reader-paragraph [entry]="entry" />
      }
    </div>
  `,
})
class HostComponent {
  readonly layout = signal<ParagraphLayout>({ key: 'a', scale: 1 });
  readonly paragraphs = store.paragraphs;
}

describe('ReaderParagraphWindowDirective', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  let scrollTo: MockInstance<typeof window.scrollTo>;

  function text(selector: string): number {
    return Number((fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent);
  }

  /** Lays every mounted paragraph out at one height, which jsdom cannot do. */
  function layOutParagraphs(height: number): void {
    for (const element of (fixture.nativeElement as HTMLElement).querySelectorAll('p.paragraph')) {
      Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 0, bottom: height, height }),
      });
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    store.status.set('ready');
    store.window.set({ first: 3, count: 2 });
    store.totalParagraphs.set(10);
    store.paragraphs.set([paragraph(3), paragraph(4)]);
    store.moveTo.mockClear();
    store.cover.mockClear();
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    geometry.barBottom.mockReturnValue(0);
    popover.open.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: ReaderStore, useValue: store },
        { provide: ReaderGeometryService, useValue: geometry },
        { provide: PopoverService, useValue: popover },
        {
          provide: ReaderSelectionStore,
          useValue: { anythingOpen: () => false, previewWord: vi.fn(), clearPreview: vi.fn() },
        },
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stands in for unmounted paragraphs at the estimated height', () => {
    expect(text('.before')).toBe(3 * DEFAULT_PARAGRAPH_HEIGHT_PX);
    expect(text('.after')).toBe(5 * DEFAULT_PARAGRAPH_HEIGHT_PX);
  });

  it('learns the paragraph height from the paragraphs it has mounted', () => {
    layOutParagraphs(100);
    vi.advanceTimersToNextFrame();
    fixture.detectChanges();

    expect(text('.before')).toBe(300);
    expect(text('.after')).toBe(500);
  });

  it('discards measurements when the layout changes, and only then', () => {
    layOutParagraphs(100);
    vi.advanceTimersToNextFrame();

    fixture.componentInstance.layout.set({ key: 'a', scale: 2 });
    fixture.detectChanges();
    expect(text('.before')).toBe(300);

    fixture.componentInstance.layout.set({ key: 'b', scale: 2 });
    fixture.detectChanges();
    expect(text('.before')).toBe(3 * DEFAULT_PARAGRAPH_HEIGHT_PX * 2);
  });

  /** Puts the reading at the top of the document and scrolls the window to `y`. */
  function scrollWindowTo(y: number): void {
    const host = (fixture.nativeElement as HTMLElement).querySelector('div')!;
    Object.defineProperty(host, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: -window.scrollY }),
    });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
  }

  it('moves the window to the paragraph a scroll has reached', () => {
    layOutParagraphs(100);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    store.cover.mockClear();

    // The screen shows the reading from 400px to 1200px, its middle at 800px.
    scrollWindowTo(400);

    expect(store.cover).toHaveBeenCalledWith(4, 8, 9);
  });

  it('brings back the paragraph at the top of the screen when scrolling up', () => {
    layOutParagraphs(100);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    scrollWindowTo(500);
    store.window.set({ first: 1, count: 8 });
    store.cover.mockClear();

    // The middle of the screen is still mounted; the top of it is a spacer.
    scrollWindowTo(0);

    expect(store.cover).toHaveBeenCalledWith(0, 4, 8);
  });

  it('never moves the window against the way the learner is scrolling', () => {
    layOutParagraphs(100);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    scrollWindowTo(400);
    store.window.set({ first: 9, count: 1 });
    store.cover.mockClear();

    // Still forwards, onto a paragraph the window has already moved past.
    scrollWindowTo(410);

    expect(store.cover).not.toHaveBeenCalled();
  });

  /** Lays the mounted paragraphs out from `top` on the screen, one after another. */
  function layOutFrom(top: number, height: number): void {
    (fixture.nativeElement as HTMLElement)
      .querySelectorAll('p.paragraph')
      .forEach((element, index) => {
        Object.defineProperty(element, 'getBoundingClientRect', {
          configurable: true,
          value: () => ({ top: top + index * height, height }),
        });
      });
  }

  it('keeps the passage at the middle of the screen through a new layout', () => {
    // The screen's middle, 400px, is half way through the second paragraph.
    layOutFrom(100, 200);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    scrollWindowTo(1000);
    scrollTo.mockClear();

    // The text doubles, and that paragraph now starts at 500px.
    fixture.componentInstance.layout.set({ key: 'b', scale: 2 });
    fixture.detectChanges();
    layOutFrom(100, 400);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    TestBed.tick();

    expect(scrollTo).toHaveBeenCalledWith({ top: 1000 + 500 + 0.5 * 400 - 400 });
  });

  it('lets a newer layout take over from a restore still waiting on the older one', () => {
    layOutFrom(100, 200);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    scrollWindowTo(1000);
    scrollTo.mockClear();

    fixture.componentInstance.layout.set({ key: 'b', scale: 2 });
    fixture.detectChanges();
    layOutFrom(100, 400);
    vi.advanceTimersToNextFrame();

    // The first restore is waiting for its render when the layout changes again.
    fixture.componentInstance.layout.set({ key: 'c', scale: 3 });
    fixture.detectChanges();
    TestBed.tick();
    expect(scrollTo).not.toHaveBeenCalled();

    layOutFrom(100, 600);
    vi.advanceTimersToNextFrame();
    TestBed.tick();

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000 + 700 + 0.5 * 600 - 400 });
  });

  it('moves the window back to the passage when a new layout finds it unmounted', () => {
    layOutFrom(100, 200);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    scrollWindowTo(1000);
    store.window.set({ first: 7, count: 2 });
    store.moveTo.mockClear();

    fixture.componentInstance.layout.set({ key: 'b', scale: 2 });
    fixture.detectChanges();
    vi.advanceTimersToNextFrame();

    expect(store.moveTo).toHaveBeenCalledWith(4);
  });

  it('stays at the very top of the reading through a new layout', () => {
    layOutFrom(100, 200);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    scrollTo.mockClear();

    fixture.componentInstance.layout.set({ key: 'b', scale: 2 });
    fixture.detectChanges();
    vi.advanceTimersToNextFrame();
    TestBed.tick();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  describe('focus when the window unmounts a word', () => {
    /** A word in each mounted paragraph, the later ones `tops` from the top of the screen. */
    function words(...tops: number[]): HTMLButtonElement[] {
      const root = fixture.nativeElement as HTMLElement;
      document.body.append(root);
      const paragraphs = [...root.querySelectorAll<HTMLElement>('p.paragraph')];
      return tops.map((top, index) => {
        const word = document.createElement('button');
        word.className = 'token';
        paragraphs[Math.min(index, paragraphs.length - 1)]!.append(word);
        Object.defineProperty(word, 'getBoundingClientRect', {
          configurable: true,
          value: () => ({ top, bottom: top + 20, height: 20 }),
        });
        return word;
      });
    }

    function settle(): void {
      layOutParagraphs(100);
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
      store.cover.mockClear();
    }

    /** The render that takes `word` out of the document, and the frame after it. */
    function unmount(word: HTMLElement): void {
      word.remove();
      store.paragraphs.set([paragraph(4)]);
      fixture.detectChanges();
      vi.advanceTimersToNextFrame();
    }

    it('hands focus on to a word on the screen without scrolling to it', async () => {
      const [leaving, staying] = words(-500, 10);
      const focus = vi.spyOn(staying!, 'focus');
      leaving!.focus();
      settle();

      scrollWindowTo(400);
      expect(store.cover).toHaveBeenCalled();
      await Promise.resolve();
      unmount(leaving!);

      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(document.activeElement).toBe(staying);
    });

    it('opens no preview on the word it hands focus to', async () => {
      const [leaving, staying] = words(-500, 10);
      const preview = fixture.debugElement.injector.get(ReaderWordPreviewService);
      // What a token does with its focus event.
      staying!.addEventListener('focus', () => {
        preview.show(
          {
            sentence: { sentence: { id: 's1' } },
            token: { id: 't1' },
            word: { tokens: [] },
            origin: staying,
          } as unknown as TokenActivation,
          {} as TemplateRef<unknown>,
          {} as ViewContainerRef,
        );
      });
      leaving!.focus();
      settle();

      scrollWindowTo(400);
      await Promise.resolve();
      unmount(leaving!);
      vi.advanceTimersByTime(PREVIEW_DELAY_MS);

      expect(document.activeElement).toBe(staying);
      expect(preview.word()).toBeNull();
      expect(popover.open).not.toHaveBeenCalled();
    });

    it('takes nothing from a learner who had already left the word', async () => {
      const [leaving, staying] = words(-500, 10);
      leaving!.focus();
      settle();

      // A move remembers the word, and it stays mounted.
      scrollWindowTo(400);
      await Promise.resolve();
      leaving!.blur();

      // A later move unmounts it, with no frame measured in between.
      scrollWindowTo(420);
      await Promise.resolve();
      unmount(leaving!);

      expect(document.activeElement).toBe(document.body);
      expect(document.activeElement).not.toBe(staying);
    });

    it('skips the words hidden under the sticky bar', async () => {
      const [leaving, underBar, clear] = words(-500, 10, 90);
      geometry.barBottom.mockReturnValue(60);
      leaving!.focus();
      settle();

      scrollWindowTo(400);
      await Promise.resolve();
      unmount(leaving!);

      expect(document.activeElement).toBe(clear);
      expect(document.activeElement).not.toBe(underBar);
    });

    for (const [key, position] of [
      ['End', 9],
      ['Home', 0],
    ] as const) {
      it(`hands focus on when ${key} unmounts the focused element`, async () => {
        const [leaving, staying] = words(-500, 10);
        leaving!.focus();
        settle();

        window.dispatchEvent(new KeyboardEvent('keydown', { key }));
        await Promise.resolve();
        expect(store.moveTo).toHaveBeenCalledWith(position);
        unmount(leaving!);

        expect(document.activeElement).toBe(staying);
      });
    }
  });

  it('moves to the last paragraph and the foot of the page on End', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    await Promise.resolve();
    vi.advanceTimersToNextFrame();

    expect(store.moveTo).toHaveBeenCalledWith(9);
    expect(scrollTo).toHaveBeenCalledWith({
      top: document.documentElement.scrollHeight,
    });
  });

  it('leaves the window alone while the reading is not ready', () => {
    store.status.set('loading');
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();

    expect(store.moveTo).not.toHaveBeenCalled();
  });
});
