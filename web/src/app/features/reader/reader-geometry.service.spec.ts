import type { ElementRef } from '@angular/core';
import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderAudioStore } from '../../application/reading/reader-audio.store';
import { ViewportService } from '../../core/platform/viewport.service';
import { sentenceId } from '../../domain/shared/ids';
import type { PopoverRef } from '../../shared-ui/popover/popover.service';
import { DockedPlayerDirective } from './docked-player.directive';
import {
  DOCKED_PLAYER_HEIGHT,
  ReaderGeometryService,
  SHEET_CLEARANCE,
} from './reader-geometry.service';
import { ReaderScrollService } from './reader-scroll.service';

const playback = {
  explicitNavigation: signal(0),
  currentSentenceId: signal<string | null>(null),
};
const mobile = signal(true);

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DockedPlayerDirective],
  providers: [ReaderScrollService, ReaderGeometryService],
  template: `
    <header #bar>Bar</header>
    <h1 #title>Title</h1>
    <div #content>
      <span data-sentence-id="s1">一。</span>
      <span data-sentence-id="s2">二。</span>
    </div>
    @if (playerOpen()) {
      <div mnDockedPlayer class="player">Player</div>
    }
  `,
})
class HostComponent {
  readonly playerOpen = signal(false);
  readonly bar = viewChild<ElementRef<HTMLElement>>('bar');
  readonly title = viewChild<ElementRef<HTMLElement>>('title');
  readonly content = viewChild<ElementRef<HTMLElement>>('content');
}

/** Observers jsdom does not have, each kept so a test can report a size. */
const resizeCallbacks: (() => void)[] = [];
let intersection: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null = null;

function box(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    x: 0,
    y: top,
    width: 100,
    height: bottom - top,
  } as DOMRect;
}

function placeAt(element: Element, top: number, bottom: number): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => box(top, bottom),
  });
}

describe('ReaderGeometryService', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  let geometry: ReaderGeometryService;
  let scrollTo: ReturnType<typeof vi.spyOn>;

  function element(selector: string): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector)!;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    resizeCallbacks.length = 0;
    intersection = null;
    playback.explicitNavigation.set(0);
    playback.currentSentenceId.set(null);
    mobile.set(true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: () => void) {
          resizeCallbacks.push(callback);
        }
        observe(): void {
          this.callback();
        }
        disconnect(): void {
          resizeCallbacks.splice(resizeCallbacks.indexOf(this.callback), 1);
        }
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
          intersection = callback;
        }
        observe(): void {
          // Reported by the test.
        }
        disconnect(): void {
          intersection = null;
        }
      },
    );
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 5000,
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: ReaderAudioStore, useValue: { playback } },
        {
          provide: ViewportService,
          useValue: { isMobile: mobile, prefersReducedMotion: signal(false) },
        },
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
    geometry = fixture.debugElement.injector.get(ReaderGeometryService);
    const host = fixture.componentInstance;
    geometry.connect({ bar: host.bar, title: host.title, content: host.content });
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    document.documentElement.style.removeProperty(DOCKED_PLAYER_HEIGHT);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function sheet(top: number): PopoverRef {
    const pane = document.createElement('div');
    placeAt(pane, top, 800);
    return { close: vi.fn(), pane, isSheet: () => true };
  }

  it('publishes the docked player height while the player is rendered', () => {
    fixture.componentInstance.playerOpen.set(true);
    fixture.detectChanges();
    placeAt(element('.player'), 700, 796);
    // The observer's report once the shell has been laid out.
    resizeCallbacks.at(-1)?.();
    expect(document.documentElement.style.getPropertyValue(DOCKED_PLAYER_HEIGHT)).toBe('96px');

    fixture.componentInstance.playerOpen.set(false);
    fixture.detectChanges();
    expect(document.documentElement.style.getPropertyValue(DOCKED_PLAYER_HEIGHT)).toBe('');
  });

  it('scrolls a pressed word clear of the sheet that docks over it', () => {
    const word = element('[data-sentence-id="s2"]');
    placeAt(word, 600, 620);

    geometry.keepClearOfSheet(word, sheet(500));
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();

    expect(scrollTo).toHaveBeenCalledWith({ top: 120 + SHEET_CLEARANCE, behavior: 'smooth' });
    expect(geometry.sheetScrollReserve()).toBe('0px');
  });

  it('reserves room at the end of a reading, and gives it back on close', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 800,
    });
    const word = element('[data-sentence-id="s2"]');
    placeAt(word, 600, 620);

    geometry.keepClearOfSheet(word, sheet(500));
    vi.advanceTimersToNextFrame();
    expect(geometry.sheetScrollReserve()).toBe(`${String(120 + SHEET_CLEARANCE)}px`);

    geometry.releaseSheet();
    expect(geometry.sheetScrollReserve()).toBe('0px');
  });

  it('leaves the page alone on a desktop, where the card sits beside its word', () => {
    mobile.set(false);
    const word = element('[data-sentence-id="s2"]');
    placeAt(word, 600, 620);

    geometry.keepClearOfSheet(word, sheet(500));
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('stops correcting once the learner scrolls with the sheet open', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 800,
    });
    const word = element('[data-sentence-id="s2"]');
    placeAt(word, 600, 620);
    geometry.keepClearOfSheet(word, sheet(500));
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    vi.runOnlyPendingTimers();
    expect(resizeCallbacks).toHaveLength(1);

    window.dispatchEvent(new Event('wheel'));

    expect(resizeCallbacks).toHaveLength(0);
    expect(geometry.sheetScrollReserve()).toBe('0px');
  });

  it('follows the sentence being read only while it is outside the readable band', async () => {
    const scrollIntoView = vi.fn();
    const near = element('[data-sentence-id="s1"]');
    const far = element('[data-sentence-id="s2"]');
    Object.assign(near, { scrollIntoView });
    Object.assign(far, { scrollIntoView });
    placeAt(element('header'), 0, 60);
    placeAt(near, 100, 140);
    placeAt(far, 900, 940);

    playback.currentSentenceId.set(sentenceId('s1'));
    TestBed.tick();
    await Promise.resolve();
    expect(scrollIntoView).not.toHaveBeenCalled();

    playback.currentSentenceId.set(sentenceId('s2'));
    TestBed.tick();
    await Promise.resolve();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('stops following after a learner scroll until an explicit navigation', async () => {
    const scrollIntoView = vi.fn();
    const far = element('[data-sentence-id="s2"]');
    Object.assign(far, { scrollIntoView });
    placeAt(far, 900, 940);

    window.dispatchEvent(new Event('wheel'));
    playback.currentSentenceId.set(sentenceId('s2'));
    TestBed.tick();
    await Promise.resolve();
    expect(scrollIntoView).not.toHaveBeenCalled();

    playback.explicitNavigation.set(1);
    TestBed.tick();
    await Promise.resolve();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('hands the title to the bar once the heading has gone beneath it', () => {
    TestBed.tick();
    expect(intersection).not.toBeNull();

    intersection?.([
      { isIntersecting: false, boundingClientRect: box(-40, 10), rootBounds: box(60, 800) },
    ]);
    expect(geometry.titleTucked()).toBe(true);

    intersection?.([
      { isIntersecting: false, boundingClientRect: box(900, 940), rootBounds: box(60, 800) },
    ]);
    expect(geometry.titleTucked()).toBe(false);
  });

  it('finds a mounted sentence and places details away from the nearer edge', () => {
    expect(geometry.sentenceElement(sentenceId('s1'))).toBe(element('[data-sentence-id="s1"]'));
    expect(geometry.sentenceElement(sentenceId('missing'))).toBeNull();
    expect(geometry.placementFor({ x: 0, y: 100 })).toBe('above');
    expect(geometry.placementFor({ x: 0, y: 700 })).toBe('below');
  });
});
