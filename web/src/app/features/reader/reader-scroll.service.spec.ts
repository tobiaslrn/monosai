import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReaderScrollService, SCROLL_SETTLE_MS, type DocumentEdge } from './reader-scroll.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ReaderScrollService],
  template: '<input aria-label="field" />',
})
class HostComponent {}

describe('ReaderScrollService', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  let service: ReaderScrollService;

  function scrollTo(y: number): void {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
    window.dispatchEvent(new Event('scroll'));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    service = fixture.debugElement.injector.get(ReaderScrollService);
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops following and records the direction when the learner scrolls', () => {
    const scrolls: boolean[] = [];
    service.onScroll((byLearner) => scrolls.push(byLearner));

    scrollTo(200);
    expect(service.following).toBe(false);
    expect(service.direction).toBe('forward');
    scrollTo(100);
    expect(service.direction).toBe('backward');
    expect(scrolls).toEqual([true, true]);

    service.resumeFollowing();
    expect(service.following).toBe(true);
  });

  it('counts a wheel or touch move as the learner, even where nothing scrolls', () => {
    window.dispatchEvent(new Event('wheel'));
    expect(service.following).toBe(false);
    service.resumeFollowing();
    window.dispatchEvent(new Event('touchmove'));
    expect(service.following).toBe(false);
  });

  it('does not take its own smooth scroll for the learner until it has settled', () => {
    const scrolls: boolean[] = [];
    service.onScroll((byLearner) => scrolls.push(byLearner));

    service.scrollTo({ top: 400, behavior: 'smooth' });
    scrollTo(400);
    expect(service.following).toBe(true);
    expect(service.direction).toBeNull();

    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    scrollTo(500);
    expect(scrolls).toEqual([false, true]);
    expect(service.following).toBe(false);
  });

  it('releases an instant jump on the next frame', () => {
    service.scrollTo({ top: 0 }, 'next-frame');
    scrollTo(10);
    expect(service.following).toBe(true);

    vi.advanceTimersToNextFrame();
    scrollTo(20);
    expect(service.following).toBe(false);
  });

  it('asks for a document edge on a bare Home or End outside a text field', () => {
    const edges: DocumentEdge[] = [];
    service.onEdge((edge) => edges.push(edge));

    const end = new KeyboardEvent('keydown', { key: 'End', cancelable: true });
    window.dispatchEvent(end);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', shiftKey: true }));
    const field = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

    expect(edges).toEqual(['end', 'start']);
    expect(end.defaultPrevented).toBe(true);
  });

  it('stops calling a listener once it has unsubscribed', () => {
    const resizes: number[] = [];
    const unsubscribe = service.onResize(() => resizes.push(1));

    window.dispatchEvent(new Event('resize'));
    unsubscribe();
    window.dispatchEvent(new Event('resize'));

    expect(resizes).toHaveLength(1);
  });

  it('removes its window listeners with the page', () => {
    const edges: DocumentEdge[] = [];
    service.onEdge((edge) => edges.push(edge));

    fixture.destroy();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));

    expect(edges).toEqual([]);
  });
});
