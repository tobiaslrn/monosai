import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParagraphGesturesDirective, type SentenceSelection } from './paragraph-gestures.directive';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ParagraphGesturesDirective],
  template: `
    <p mnParagraphGestures (sentenceSelected)="selections.push($event)">
      <span data-sentence-id="s1">猫が。</span>
      <span data-sentence-id="s2">犬も。</span>
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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function paragraph(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('p')!;
  }

  function click(clientX: number, clientY: number): void {
    paragraph().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY }));
  }

  function pointerDown(pointerType: string, clientX: number, clientY: number): void {
    paragraph().dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType, clientX, clientY }),
    );
  }

  function selections(): readonly SentenceSelection[] {
    return fixture.componentInstance.selections;
  }

  it('selects the sentence a press landed in', () => {
    click(50, 110);

    expect(selections()).toHaveLength(1);
    expect(selections()[0].sentenceId).toBe('s1');
  });

  it('selects from the leading between two lines, which belongs to no sentence', () => {
    // The press that a per-sentence listener would have dropped, and the whole
    // reason the gesture is resolved at the paragraph.
    click(50, 137);

    expect(selections()[0].sentenceId).toBe('s2');
  });

  it('carries the press position, so the popover opens where it was asked for', () => {
    click(64, 150);

    expect(selections()[0]).toMatchObject({ sentenceId: 's2', x: 64, y: 150 });
  });

  it('ignores a click reported at the origin rather than guessing a sentence', () => {
    // Assistive technology synthesizes these; its route in is the word buttons.
    click(0, 0);

    expect(selections()).toHaveLength(0);
  });

  it('leaves a press that selected text alone', () => {
    const selection = { isCollapsed: false } as Selection;
    vi.spyOn(window, 'getSelection').mockReturnValue(selection);

    click(50, 110);

    expect(selections()).toHaveLength(0);
  });

  it('ignores a tap, which on touch is how the reader dismisses and scrolls on', () => {
    // The gesture that used to select. Answering it with a popover meant every
    // attempt to put one away opened the next one.
    pointerDown('touch', 50, 110);
    paragraph().dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }),
    );
    click(50, 110);

    expect(selections()).toHaveLength(0);
  });

  it('selects on a mouse click again after a touch tap, on a device with both', () => {
    pointerDown('touch', 50, 110);
    click(50, 110);
    pointerDown('mouse', 50, 110);
    click(50, 110);

    expect(selections()).toHaveLength(1);
  });

  it('tints the sentence under a finger while the press is being timed', () => {
    vi.useFakeTimers();
    const target = paragraph().querySelector<HTMLElement>('[data-sentence-id="s2"]')!;

    pointerDown('touch', 50, 150);
    expect(target.classList.contains('is-pressing')).toBe(true);

    // Selecting hands the tint over to the open sentence, and a press that
    // turns into a scroll takes it away again.
    vi.advanceTimersByTime(450);
    expect(target.classList.contains('is-pressing')).toBe(false);

    pointerDown('touch', 50, 150);
    paragraph().dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerType: 'touch',
        clientX: 50,
        clientY: 190,
      }),
    );
    expect(target.classList.contains('is-pressing')).toBe(false);
  });

  it('suppresses the platform long-press menu that would cover the popover', () => {
    pointerDown('touch', 50, 110);
    const menu = new Event('contextmenu', { bubbles: true, cancelable: true });
    paragraph().dispatchEvent(menu);

    expect(menu.defaultPrevented).toBe(true);
  });

  it('leaves the mouse its own context menu', () => {
    pointerDown('mouse', 50, 110);
    const menu = new Event('contextmenu', { bubbles: true, cancelable: true });
    paragraph().dispatchEvent(menu);

    expect(menu.defaultPrevented).toBe(false);
  });

  it('selects on a touch long press, including one that started on a word', () => {
    vi.useFakeTimers();

    paragraph().dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
        clientX: 50,
        clientY: 150,
      }),
    );
    vi.advanceTimersByTime(500);

    expect(selections()[0].sentenceId).toBe('s2');
  });

  it('treats a press that moved as a scroll rather than a long press', () => {
    vi.useFakeTimers();

    paragraph().dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
        clientX: 50,
        clientY: 150,
      }),
    );
    paragraph().dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerType: 'touch',
        clientX: 50,
        clientY: 190,
      }),
    );
    vi.advanceTimersByTime(500);

    expect(selections()).toHaveLength(0);
  });

  it('eats the click a long press ends in, but never the next gesture', () => {
    vi.useFakeTimers();
    const longPress = (): void => {
      paragraph().dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerType: 'touch',
          clientX: 50,
          clientY: 150,
        }),
      );
      vi.advanceTimersByTime(500);
    };
    let wordPresses = 0;
    const word = document.createElement('button');
    word.addEventListener('click', () => {
      wordPresses += 1;
    });
    paragraph().append(word);

    // The click the finger's release produces belongs to the press that has
    // already been answered with a sentence.
    longPress();
    word.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 150 }));
    expect(wordPresses).toBe(0);

    // A new gesture is a new intent, and must not be eaten by the last guard.
    longPress();
    paragraph().dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
        clientX: 9,
        clientY: 9,
      }),
    );
    word.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 9, clientY: 9 }));
    expect(wordPresses).toBe(1);
  });

  it('does not long-press for a mouse, which has its own route', () => {
    vi.useFakeTimers();

    paragraph().dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'mouse',
        clientX: 50,
        clientY: 150,
      }),
    );
    vi.advanceTimersByTime(500);

    expect(selections()).toHaveLength(0);
  });
});
