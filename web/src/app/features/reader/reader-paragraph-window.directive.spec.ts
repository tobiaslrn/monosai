import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderParagraph } from '../../application/reading/reader.store';
import { ReaderStore } from '../../application/reading/reader.store';
import {
  DEFAULT_PARAGRAPH_HEIGHT_PX,
  type ParagraphWindowState,
} from '../../domain/reading/paragraph-window';
import { paragraphId, readingId } from '../../domain/shared/ids';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import {
  ReaderParagraphWindowDirective,
  type ParagraphLayout,
} from './reader-paragraph-window.directive';
import { ReaderScrollService } from './reader-scroll.service';

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
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderParagraphWindowDirective, ReaderParagraphComponent],
  providers: [ReaderScrollService],
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
  let scrollTo: ReturnType<typeof vi.spyOn>;

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
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    TestBed.configureTestingModule({ providers: [{ provide: ReaderStore, useValue: store }] });
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
    store.moveTo.mockClear();

    // The middle of the screen, 800px into the reading, is the ninth paragraph.
    scrollWindowTo(400);

    expect(store.moveTo).toHaveBeenCalledWith(8);
  });

  it('never moves the window against the way the learner is scrolling', () => {
    layOutParagraphs(100);
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    scrollWindowTo(400);
    store.window.set({ first: 9, count: 1 });
    store.moveTo.mockClear();

    // Still forwards, onto a paragraph the window has already moved past.
    scrollWindowTo(410);

    expect(store.moveTo).not.toHaveBeenCalled();
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
