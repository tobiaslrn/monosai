import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualItemDirective, VirtualListDirective } from './virtual-list.directive';

interface Row {
  readonly key: string;
}

function rows(count: number, prefix = 'row'): readonly Row[] {
  return Array.from({ length: count }, (_, index) => ({ key: `${prefix}-${String(index)}` }));
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VirtualListDirective, VirtualItemDirective],
  template: `
    <div
      #list="virtualList"
      [mnVirtualList]="items()"
      [estimateHeight]="estimate"
      [overscanPx]="overscan()"
      [loadMoreThresholdPx]="50"
      [generation]="generation()"
      (nearEnd)="nearEnd = nearEnd + 1"
    >
      <p class="top">{{ list.range().topSpacer }}</p>
      @for (row of list.visibleItems(); track row.key) {
        <div class="row" [mnVirtualItem]="row.key">{{ row.key }}</div>
      }
      <p class="bottom">{{ list.range().bottomSpacer }}</p>
    </div>
  `,
})
class HostComponent {
  readonly items = signal(rows(100));
  readonly generation = signal(1);
  readonly overscan = signal(100);
  readonly estimate = (): number => 50;
  nearEnd = 0;
}

describe('VirtualListDirective', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  /** How far down the document the list starts. */
  let listTop = 0;
  const windowDescriptors = new Map<string, PropertyDescriptor | undefined>();

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function mounted(): string[] {
    return [...element().querySelectorAll('.row')].map((row) => row.textContent.trim());
  }

  function spacer(selector: string): number {
    return Number(element().querySelector(selector)?.textContent);
  }

  /** The window is scrolled to `y`. */
  function scrollTo(y: number): void {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
  }

  /** Lays every mounted row out at one height, which jsdom cannot do. */
  function layOutRows(height: number): void {
    for (const row of element().querySelectorAll('.row')) {
      Object.defineProperty(row, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 0, bottom: height, height }),
      });
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    listTop = 0;
    for (const property of ['scrollY', 'innerHeight']) {
      windowDescriptors.set(property, Object.getOwnPropertyDescriptor(window, property));
    }
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host = element().querySelector('div')!;
    Object.defineProperty(host, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: listTop - window.scrollY }),
    });
    scrollTo(0);
  });

  afterEach(() => {
    fixture.destroy();
    for (const [property, descriptor] of windowDescriptors) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(window, property);
      } else {
        Object.defineProperty(window, property, descriptor);
      }
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts the rows in view and the overscan, and stands in for the rest', () => {
    // 400px of viewport and 100px of overscan at 50px a row.
    expect(mounted()).toHaveLength(10);
    expect(spacer('.top')).toBe(0);
    expect(spacer('.bottom')).toBe(90 * 50);
  });

  it('moves the mounted rows with a window scroll', () => {
    scrollTo(1000);

    expect(mounted()[0]).toBe('row-18');
    expect(spacer('.top')).toBe(18 * 50);
  });

  it('measures scroll from where the list starts, not from the top of the document', () => {
    listTop = 300;
    scrollTo(0);
    // Only the 100px of the list inside the viewport, plus the overscan.
    expect(mounted()).toHaveLength(4);

    scrollTo(1300);
    expect(mounted()[0]).toBe('row-18');
    expect(spacer('.top')).toBe(18 * 50);
  });

  it('takes a changed overscan without losing measurements', () => {
    layOutRows(100);
    vi.advanceTimersToNextFrame();
    fixture.detectChanges();
    expect(mounted()).toHaveLength(5);

    fixture.componentInstance.overscan.set(0);
    fixture.detectChanges();

    // 400px of viewport at the measured 100px a row, and the ten rows measured
    // so far still counted at their height rather than the estimate.
    expect(mounted()).toHaveLength(4);
    expect(spacer('.bottom')).toBe(10 * 100 + 90 * 50 - 4 * 100);
  });

  it('measures the rows it mounts and lays out the rest around them', () => {
    layOutRows(100);
    vi.advanceTimersToNextFrame();
    fixture.detectChanges();

    expect(spacer('.bottom')).toBeGreaterThan(90 * 50);
    expect(mounted().length).toBeLessThan(10);
  });

  it('keeps measurements for stable keys, and drops them for a new collection', () => {
    layOutRows(100);
    vi.advanceTimersToNextFrame();
    fixture.detectChanges();
    const measured = spacer('.bottom');

    fixture.componentInstance.items.set([...rows(100), { key: 'appended' }]);
    fixture.detectChanges();
    expect(spacer('.bottom')).toBe(measured + 50);

    fixture.componentInstance.generation.set(2);
    fixture.componentInstance.items.set(rows(100));
    fixture.detectChanges();
    expect(spacer('.bottom')).toBe(90 * 50);
  });

  it('says when the viewport reaches the end of the loaded rows', () => {
    const before = fixture.componentInstance.nearEnd;
    scrollTo(100 * 50 - 400 - 100);
    expect(fixture.componentInstance.nearEnd).toBe(before);

    scrollTo(100 * 50 - 400 - 40);
    expect(fixture.componentInstance.nearEnd).toBe(before + 1);
  });

  it('marks each mounted slot with its key', () => {
    expect(element().querySelector('.row')?.getAttribute('data-virtual-key')).toBe('row-0');
  });
});
