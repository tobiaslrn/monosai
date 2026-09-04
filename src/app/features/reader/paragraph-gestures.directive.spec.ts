import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ParagraphGesturesDirective,
  SENTENCE_DOUBLE_TAP_WINDOW_MS,
  type SentenceSelection,
} from './paragraph-gestures.directive';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ParagraphGesturesDirective],
  template: `
    <p mnParagraphGestures (sentenceSelected)="selections.push($event)">
      <span data-sentence-id="s1">猫が。</span>
      <span data-sentence-id="s2">犬も。<button class="token" type="button">単語</button></span>
    </p>
  `,
})
class HostComponent {
  readonly selections: SentenceSelection[] = [];
}

/** jsdom lays nothing out, so the line boxes the rule reads are supplied here. */
function layOut(element: HTMLElement, rects: readonly DOMRect[]): void {
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => rects,
  });
}

function rect(top: number, bottom: number, left: number, right: number): DOMRect {
  return {
    top,
    bottom,
    left,
    right,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  };
}

describe('ParagraphGesturesDirective', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    layOut(element.querySelector<HTMLElement>('[data-sentence-id="s1"]')!, [
      rect(100, 120, 0, 200),
    ]);
    layOut(element.querySelector<HTMLElement>('[data-sentence-id="s2"]')!, [
      rect(140, 160, 0, 200),
    ]);
    // ReaderTokenComponent stops its own click so a delayed word activation
    // cannot also select the surrounding sentence.
    element.querySelector<HTMLButtonElement>('button.token')?.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function paragraph(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('p')!;
  }

  function word(): HTMLButtonElement {
    return paragraph().querySelector('button.token')!;
  }

  function click(target: EventTarget, clientX: number, clientY: number): void {
    target.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY }),
    );
  }

  function pointer(
    type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove',
    target: EventTarget,
    pointerType: string,
    clientX: number,
    clientY: number,
    pointerId = 1,
  ): void {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType,
        pointerId,
        clientX,
        clientY,
      }),
    );
  }

  function touchTap(target: EventTarget, clientX: number, clientY: number, pointerId = 1): void {
    pointer('pointerdown', target, 'touch', clientX, clientY, pointerId);
    pointer('pointerup', target, 'touch', clientX, clientY, pointerId);
    target.dispatchEvent(new Event('selectstart', { bubbles: true, cancelable: true }));
    click(target, clientX, clientY);
  }

  function selections(): readonly SentenceSelection[] {
    return fixture.componentInstance.selections;
  }

  it('selects a sentence from mouse prose immediately', () => {
    click(paragraph(), 50, 110);

    expect(selections()).toEqual([{ sentenceId: 's1', x: 50, y: 110 }]);
  });

  it('selects from the leading between two lines', () => {
    click(paragraph(), 50, 137);

    expect(selections()[0].sentenceId).toBe('s2');
  });

  it('does not delay a keyboard word activation', () => {
    let activations = 0;
    word().addEventListener('click', () => {
      activations += 1;
    });

    click(word(), 0, 0);

    expect(activations).toBe(1);
  });

  it('does not let a mouse selection start suppress the following click', () => {
    let activations = 0;
    word().addEventListener('click', () => {
      activations += 1;
    });

    pointer('pointerdown', word(), 'mouse', 50, 150);
    document.dispatchEvent(new Event('selectstart', { bubbles: true, cancelable: true }));
    pointer('pointerup', word(), 'mouse', 50, 150);
    click(word(), 50, 150);

    expect(activations).toBe(1);
  });

  it('delays one touch word tap until the double-tap window expires', () => {
    vi.useFakeTimers();
    let activations = 0;
    word().addEventListener('click', () => {
      activations += 1;
    });

    touchTap(word(), 50, 150);
    expect(activations).toBe(0);

    vi.advanceTimersByTime(SENTENCE_DOUBLE_TAP_WINDOW_MS - 1);
    expect(activations).toBe(0);
    vi.advanceTimersByTime(1);

    expect(activations).toBe(1);
  });

  it('opens sentence details on two touch taps on the same sentence word', () => {
    let activations = 0;
    word().addEventListener('click', () => {
      activations += 1;
    });

    touchTap(word(), 50, 150);
    touchTap(word(), 60, 151);

    expect(selections()).toEqual([{ sentenceId: 's2', x: 60, y: 151 }]);
    expect(activations).toBe(0);
  });

  it('recognizes two taps in sentence whitespace', () => {
    touchTap(paragraph(), 50, 110);
    touchTap(paragraph(), 60, 111);

    expect(selections()[0].sentenceId).toBe('s1');
  });

  it('requires both the same sentence and the distance window', () => {
    vi.useFakeTimers();
    touchTap(word(), 50, 150);
    touchTap(paragraph(), 50, 110);

    expect(selections()).toHaveLength(0);

    vi.advanceTimersByTime(SENTENCE_DOUBLE_TAP_WINDOW_MS + 1);
    touchTap(word(), 50, 150);
    vi.advanceTimersByTime(SENTENCE_DOUBLE_TAP_WINDOW_MS + 1);
    touchTap(word(), 75, 150);
    expect(selections()).toHaveLength(0);
  });

  it('flushes a first word tap before starting a tap on another sentence', () => {
    vi.useFakeTimers();
    let activations = 0;
    word().addEventListener('click', () => {
      activations += 1;
    });

    touchTap(word(), 50, 150);
    touchTap(paragraph(), 50, 110);

    expect(activations).toBe(1);
    vi.advanceTimersByTime(SENTENCE_DOUBLE_TAP_WINDOW_MS);
    expect(selections()).toHaveLength(0);
  });

  it.each(['scroll', 'selectionchange'] as const)('cancels a pending tap on %s', (eventName) => {
    vi.useFakeTimers();
    let activations = 0;
    word().addEventListener('click', () => {
      activations += 1;
    });
    touchTap(word(), 50, 150);

    if (eventName === 'selectionchange') {
      vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false } as Selection);
    }
    (eventName === 'scroll' ? window : document).dispatchEvent(new Event(eventName));
    vi.advanceTimersByTime(SENTENCE_DOUBLE_TAP_WINDOW_MS + 1);

    expect(activations).toBe(0);
    expect(selections()).toHaveLength(0);
  });

  it('cancels a pending tap on pointer cancellation', () => {
    vi.useFakeTimers();
    let activations = 0;
    word().addEventListener('click', () => {
      activations += 1;
    });
    touchTap(word(), 50, 150);
    pointer('pointercancel', word(), 'touch', 50, 150);
    vi.advanceTimersByTime(SENTENCE_DOUBLE_TAP_WINDOW_MS + 1);

    expect(activations).toBe(0);
  });

  it('cancels the first touch when a second finger appears', () => {
    vi.useFakeTimers();
    let activations = 0;
    word().addEventListener('click', () => {
      activations += 1;
    });
    pointer('pointerdown', word(), 'touch', 50, 150, 1);
    pointer('pointerdown', paragraph(), 'touch', 60, 150, 2);
    pointer('pointerup', word(), 'touch', 50, 150, 1);
    click(word(), 50, 150);
    vi.advanceTimersByTime(SENTENCE_DOUBLE_TAP_WINDOW_MS + 1);

    expect(activations).toBe(0);
    expect(selections()).toHaveLength(0);
  });

  it('keeps the native context menu available on touch', () => {
    const menu = new Event('contextmenu', { bubbles: true, cancelable: true });
    paragraph().dispatchEvent(menu);

    expect(menu.defaultPrevented).toBe(false);
  });

  it('does not select or tint a sentence after a long native press', () => {
    vi.useFakeTimers();
    pointer('pointerdown', paragraph(), 'touch', 50, 110);
    vi.advanceTimersByTime(1_000);

    expect(selections()).toHaveLength(0);
    expect(paragraph().querySelector('.is-pressing')).toBeNull();
  });

  it('does not turn a touch drag into a tap', () => {
    vi.useFakeTimers();
    pointer('pointerdown', paragraph(), 'touch', 50, 110);
    pointer('pointermove', paragraph(), 'touch', 80, 150);
    pointer('pointerup', paragraph(), 'touch', 80, 150);
    click(paragraph(), 80, 150);
    vi.advanceTimersByTime(SENTENCE_DOUBLE_TAP_WINDOW_MS + 1);

    expect(selections()).toHaveLength(0);
  });
});
