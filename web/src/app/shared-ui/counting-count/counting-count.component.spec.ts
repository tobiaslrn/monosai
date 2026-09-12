import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCountOf } from '../../domain/shared/locale';
import { CountingCountComponent } from './counting-count.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CountingCountComponent],
  template: `<mn-counting-count [count]="count()" [format]="words" />`,
})
class HostComponent {
  readonly count = signal(340);
  readonly words = (value: number): string => formatCountOf(value, 'word');
}

/**
 * One frame at a time, so a rise can be watched rather than waited out.
 *
 * Angular's own scheduler asks for frames here too, so every callback pending
 * at the moment of the advance is run with the same timestamp rather than only
 * the last one registered.
 */
function frames(): { advance: (ms: number) => void } {
  let now = 0;
  let handle = 0;
  const pending = new Map<number, (timestamp: number) => void>();
  vi.stubGlobal('requestAnimationFrame', (callback: (timestamp: number) => void) => {
    handle += 1;
    pending.set(handle, callback);
    return handle;
  });
  vi.stubGlobal('cancelAnimationFrame', (cancelled: number) => {
    pending.delete(cancelled);
  });
  return {
    advance: (ms: number) => {
      now += ms;
      const due = [...pending.values()];
      pending.clear();
      for (const callback of due) {
        callback(now);
      }
    },
  };
}

describe('CountingCountComponent', () => {
  let clock: { advance: (ms: number) => void };

  beforeEach(() => {
    clock = frames();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function render(): ComponentFixture<HostComponent> {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<HostComponent>): string {
    return (fixture.nativeElement as HTMLElement).textContent.trim();
  }

  /** The moving number, whether or not a settled copy sits beside it. */
  function tick(fixture: ComponentFixture<HostComponent>): string {
    return (fixture.nativeElement as HTMLElement).querySelector('.tick')?.textContent ?? '';
  }

  /**
   * The value is the text before any frame runs, so a renderer that never
   * paints — a test, a prerender, reduced motion — is never left holding a
   * number the learner does not have.
   */
  it('renders the settled value before it rises', () => {
    expect(text(render())).toBe('340 words');
  });

  /** Nothing moved yet, so nothing moves: the first value is simply the number. */
  it('states the first value it is given without rising to it', () => {
    const fixture = render();

    clock.advance(0);
    fixture.detectChanges();
    expect(tick(fixture)).toBe('340 words');

    clock.advance(1000);
    fixture.detectChanges();
    expect(tick(fixture)).toBe('340 words');
  });

  /** Motion's job here is to say the number moved, so a change always rises. */
  it('rises from the number it was showing when the value changes', () => {
    const fixture = render();

    fixture.componentInstance.count.set(360);
    fixture.detectChanges();
    clock.advance(0);
    fixture.detectChanges();
    expect(tick(fixture)).toBe('340 words');

    clock.advance(1000);
    fixture.detectChanges();
    expect(text(fixture)).toBe('360 words');
  });

  /** A moving number is decoration over the fact, and is not read as one. */
  it('keeps the settled value available while the number is moving', () => {
    const fixture = render();
    fixture.componentInstance.count.set(360);
    fixture.detectChanges();

    clock.advance(0);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.tick')?.getAttribute('aria-hidden')).toBe('true');
    expect(element.querySelector('.mn-visually-hidden')?.textContent).toBe('360 words');

    clock.advance(1000);
    fixture.detectChanges();
    expect(element.querySelector('.tick')?.getAttribute('aria-hidden')).toBeNull();
    expect(element.querySelector('.mn-visually-hidden')).toBeNull();
  });

  /** Returning to a screen states the count; it does not perform it. */
  it('does not rise when the same value is rendered again', () => {
    const first = render();
    clock.advance(0);
    first.destroy();

    const second = render();
    clock.advance(0);
    second.detectChanges();
    expect(text(second)).toBe('340 words');
  });
});
