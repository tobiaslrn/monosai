import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GenerationRingComponent } from './generation-ring.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GenerationRingComponent],
  template: `<mn-generation-ring [fraction]="fraction()" />`,
})
class HostComponent {
  readonly fraction = signal(0);
}

describe('GenerationRingComponent', () => {
  function render(): {
    fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
    element: HTMLElement;
    fill: () => SVGCircleElement;
  } {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const fill = (): SVGCircleElement => {
      const circle = element.querySelector<SVGCircleElement>('.ring-fill');
      if (circle === null) {
        throw new Error('The ring has no fill.');
      }
      return circle;
    };
    return { fixture, element, fill };
  }

  it('is decoration: hidden from assistive technology and never focusable', () => {
    const { element } = render();
    const svg = element.querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
  });

  it('draws a track and a fill on the same circle', () => {
    const { element, fill } = render();
    const track = element.querySelector('.ring-track');

    expect(track?.getAttribute('r')).toBe(fill().getAttribute('r'));
  });

  it('is empty at nothing, and full at everything', () => {
    const { fixture, fill } = render();
    const circumference = Number(fill().getAttribute('stroke-dasharray'));

    expect(Number(fill().getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference);

    fixture.componentInstance.fraction.set(1);
    fixture.detectChanges();

    expect(Number(fill().getAttribute('stroke-dashoffset'))).toBeCloseTo(0);
  });

  it('draws a fraction as that share of the circle', () => {
    const { fixture, fill } = render();

    fixture.componentInstance.fraction.set(0.25);
    fixture.detectChanges();

    const circumference = Number(fill().getAttribute('stroke-dasharray'));
    expect(Number(fill().getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.75);
  });
});
