import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SentenceGesturesDirective,
  type SentenceGestureOrigin,
} from './sentence-gestures.directive';

/** jsdom has no `PointerEvent`, so the two fields the directive reads are added. */
function pointerEvent(
  type: string,
  pointerType: string,
  coordinates: { x: number; y: number },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: coordinates.x,
    clientY: coordinates.y,
  });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SentenceGesturesDirective],
  template: `
    <span class="sentence" mnSentenceGestures (menuRequested)="requests.push($event)">
      <button type="button" class="token" (click)="onToken($event)">猫</button>
      。
    </span>
  `,
})
class HostComponent {
  readonly requests: SentenceGestureOrigin[] = [];
  tokenClicks = 0;

  onToken(event: MouseEvent): void {
    event.stopPropagation();
    this.tokenClicks += 1;
  }
}

describe('SentenceGesturesDirective', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function sentenceOf(fixture: ReturnType<typeof render>): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.sentence')!;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks for the menu when the sentence whitespace is clicked', () => {
    const fixture = render();

    sentenceOf(fixture).dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: 120, clientY: 240 }),
    );

    expect(fixture.componentInstance.requests).toEqual([{ x: 120, y: 240 }]);
  });

  it('never asks for the menu when a word is clicked', () => {
    const fixture = render();

    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();

    expect(fixture.componentInstance.tokenClicks).toBe(1);
    expect(fixture.componentInstance.requests).toEqual([]);
  });

  it('opens the menu on a long press, and swallows the click it produces', () => {
    const fixture = render();
    const sentence = sentenceOf(fixture);

    sentence.dispatchEvent(pointerEvent('pointerdown', 'touch', { x: 40, y: 60 }));
    vi.advanceTimersByTime(500);

    expect(fixture.componentInstance.requests).toEqual([{ x: 40, y: 60 }]);

    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();
    expect(fixture.componentInstance.tokenClicks).toBe(0);
  });

  it('does not fire after a scroll', () => {
    const fixture = render();

    sentenceOf(fixture).dispatchEvent(pointerEvent('pointerdown', 'touch', { x: 40, y: 60 }));
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(500);

    expect(fixture.componentInstance.requests).toEqual([]);
  });

  it('does not fire after the pointer is dragged', () => {
    const fixture = render();
    const sentence = sentenceOf(fixture);

    sentence.dispatchEvent(pointerEvent('pointerdown', 'touch', { x: 40, y: 60 }));
    sentence.dispatchEvent(pointerEvent('pointermove', 'touch', { x: 40, y: 140 }));
    vi.advanceTimersByTime(500);

    expect(fixture.componentInstance.requests).toEqual([]);
  });

  it('does not fire after the press is lifted', () => {
    const fixture = render();
    const sentence = sentenceOf(fixture);

    sentence.dispatchEvent(pointerEvent('pointerdown', 'touch', { x: 40, y: 60 }));
    sentence.dispatchEvent(pointerEvent('pointerup', 'touch', { x: 40, y: 60 }));
    vi.advanceTimersByTime(500);

    expect(fixture.componentInstance.requests).toEqual([]);
  });

  it('leaves a mouse press to the click handler', () => {
    const fixture = render();

    sentenceOf(fixture).dispatchEvent(pointerEvent('pointerdown', 'mouse', { x: 40, y: 60 }));
    vi.advanceTimersByTime(500);

    expect(fixture.componentInstance.requests).toEqual([]);
  });

  it('ignores a click that ended a text selection', () => {
    const fixture = render();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(sentenceOf(fixture));
    selection?.removeAllRanges();
    selection?.addRange(range);

    sentenceOf(fixture).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    selection?.removeAllRanges();

    expect(fixture.componentInstance.requests).toEqual([]);
  });

  it('anchors to the sentence when a click carries no position', () => {
    const fixture = render();
    const sentence = sentenceOf(fixture);

    // A click synthesized by assistive technology reports (0, 0).
    sentence.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fixture.componentInstance.requests).toEqual([sentence]);
  });
});
