import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ParagraphGesturesDirective,
  SENTENCE_LONG_PRESS_MS,
  type SentenceSelection,
} from './paragraph-gestures.directive';
import { isPointerGestureConsumed } from '../../core/platform/pointer-gestures';

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
    vi.useFakeTimers();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    layOut(element.querySelector<HTMLElement>('[data-sentence-id="s1"]')!, [
      rect(100, 120, 0, 200),
    ]);
    layOut(element.querySelector<HTMLElement>('[data-sentence-id="s2"]')!, [
      rect(140, 160, 0, 200),
    ]);
    // ReaderTokenComponent stops its own click so a word activation cannot also
    // select the surrounding sentence.
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
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY, detail: 1 }),
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

  /** A short tap: press, release, and the click the browser makes from it. */
  function touchTap(target: EventTarget, clientX: number, clientY: number, pointerId = 1): void {
    pointer('pointerdown', target, 'touch', clientX, clientY, pointerId);
    pointer('pointerup', target, 'touch', clientX, clientY, pointerId);
    click(target, clientX, clientY);
  }

  /** A press held past the threshold, then released. */
  function longPress(target: EventTarget, clientX: number, clientY: number, pointerId = 1): void {
    pointer('pointerdown', target, 'touch', clientX, clientY, pointerId);
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS + 1);
    pointer('pointerup', target, 'touch', clientX, clientY, pointerId);
    click(target, clientX, clientY);
  }

  function selections(): readonly SentenceSelection[] {
    return fixture.componentInstance.selections;
  }

  function wordActivations(): { count: () => number } {
    let activations = 0;
    word().addEventListener('click', () => {
      activations += 1;
    });
    return { count: () => activations };
  }

  it('selects a sentence from mouse prose immediately', () => {
    click(paragraph(), 50, 110);

    expect(selections()).toEqual([{ sentenceId: 's1', x: 50, y: 110, modality: 'mouse' }]);
  });

  it('selects from the leading between two lines', () => {
    click(paragraph(), 50, 137);

    expect(selections()[0].sentenceId).toBe('s2');
  });

  it('does not delay a keyboard word activation', () => {
    const activations = wordActivations();

    click(word(), 0, 0);

    expect(activations.count()).toBe(1);
    expect(selections()).toHaveLength(0);
  });

  it('leaves a short touch tap on a word entirely alone', () => {
    const activations = wordActivations();

    touchTap(word(), 50, 150);
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS + 1);

    expect(activations.count()).toBe(1);
    expect(selections()).toHaveLength(0);
  });

  it('opens nothing when a short tap lands between words', () => {
    touchTap(paragraph(), 50, 110);
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS + 1);

    // The line underneath is reached by holding. A tap there is a dismissal,
    // which belongs to whatever surface is open rather than to the paragraph.
    expect(selections()).toHaveLength(0);
  });

  it('opens sentence details while the finger is still down', () => {
    pointer('pointerdown', paragraph(), 'touch', 50, 110);
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS + 1);

    expect(selections()).toEqual([{ sentenceId: 's1', x: 50, y: 110, modality: 'touch' }]);
    // The release the press is heading for belongs to this gesture, so the
    // popover's outside-press rule must not read it as a dismissal.
    expect(isPointerGestureConsumed(1)).toBe(true);
  });

  it('resolves a long press on a word to its sentence and consumes the click', () => {
    const activations = wordActivations();

    longPress(word(), 50, 150);

    expect(selections()).toEqual([{ sentenceId: 's2', x: 50, y: 150, modality: 'touch' }]);
    // The word under the finger must not open on top of the sheet that
    // replaced it.
    expect(activations.count()).toBe(0);
  });

  it('does not repeat while the press is held', () => {
    pointer('pointerdown', paragraph(), 'touch', 50, 110);
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS * 4);

    expect(selections()).toHaveLength(1);
  });

  it('leaves the next independent tap alone after a long press', () => {
    longPress(paragraph(), 50, 110);
    const activations = wordActivations();

    touchTap(word(), 50, 150, 2);

    expect(activations.count()).toBe(1);
    expect(selections()).toHaveLength(1);
  });

  it('cancels a press that travels beyond the movement tolerance', () => {
    pointer('pointerdown', paragraph(), 'touch', 50, 110);
    pointer('pointermove', paragraph(), 'touch', 50, 128);
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS + 1);

    expect(selections()).toHaveLength(0);
  });

  it('keeps a press that only trembles', () => {
    pointer('pointerdown', paragraph(), 'touch', 50, 110);
    pointer('pointermove', paragraph(), 'touch', 53, 112);
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS + 1);

    expect(selections()).toHaveLength(1);
  });

  it('cancels the press when a second finger appears', () => {
    pointer('pointerdown', paragraph(), 'touch', 50, 110, 1);
    pointer('pointerdown', paragraph(), 'touch', 90, 115, 2);
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS + 1);

    expect(selections()).toHaveLength(0);
  });

  it.each(['scroll', 'blur'] as const)('cancels the press on window %s', (eventName) => {
    pointer('pointerdown', paragraph(), 'touch', 50, 110);
    window.dispatchEvent(new Event(eventName));
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS + 1);

    expect(selections()).toHaveLength(0);
  });

  it('cancels the press on pointer cancellation', () => {
    pointer('pointerdown', paragraph(), 'touch', 50, 110);
    pointer('pointercancel', paragraph(), 'touch', 50, 110);
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS + 1);

    expect(selections()).toHaveLength(0);
  });

  it('cancels the press when the paragraph is removed under it', () => {
    pointer('pointerdown', paragraph(), 'touch', 50, 110);
    fixture.destroy();
    vi.advanceTimersByTime(SENTENCE_LONG_PRESS_MS + 1);

    expect(selections()).toHaveLength(0);
  });

  it('suppresses the platform callout on touch and keeps it for a mouse', () => {
    pointer('pointerdown', paragraph(), 'touch', 50, 110);
    const touchMenu = new Event('contextmenu', { bubbles: true, cancelable: true });
    paragraph().dispatchEvent(touchMenu);
    expect(touchMenu.defaultPrevented).toBe(true);

    pointer('pointerdown', paragraph(), 'mouse', 50, 110);
    const mouseMenu = new Event('contextmenu', { bubbles: true, cancelable: true });
    paragraph().dispatchEvent(mouseMenu);
    expect(mouseMenu.defaultPrevented).toBe(false);
  });

  it('does not turn a mouse drag into a selection', () => {
    pointer('pointerdown', paragraph(), 'mouse', 50, 110);
    pointer('pointermove', paragraph(), 'mouse', 80, 150);
    pointer('pointerup', paragraph(), 'mouse', 80, 150);
    click(paragraph(), 80, 150);

    expect(selections()).toHaveLength(0);
  });

  it('ignores a mouse click while text is selected', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false } as Selection);

    click(paragraph(), 50, 110);

    expect(selections()).toHaveLength(0);
  });
});
