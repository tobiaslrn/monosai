import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { sampleHeatLevels } from './sample-reading-progress';
import { StreakCalendarComponent } from './streak-calendar.component';

function render(): HTMLElement {
  const fixture = TestBed.createComponent(StreakCalendarComponent);
  fixture.componentRef.setInput('levels', sampleHeatLevels());
  fixture.componentRef.setInput('streakDays', 5);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('StreakCalendarComponent', () => {
  it('draws a square for every day and outlines only today, the last', () => {
    const cells = [...render().querySelectorAll('.grid .cell')];

    expect(cells).toHaveLength(112);
    expect(cells.filter((cell) => cell.classList.contains('is-today'))).toEqual([cells.at(-1)]);
    expect(cells.map((cell) => cell.getAttribute('data-level'))).toEqual(
      sampleHeatLevels().map(String),
    );
  });

  it('states the streak and the span it covers in words', () => {
    const head = [...render().querySelectorAll('.head > span')].map((part) =>
      part.textContent.trim(),
    );

    expect(head).toEqual(['5-day streak', 'Last 16 weeks']);
  });

  /** A hundred and twelve unnamed squares are noise; one named picture is not. */
  it('is one image, named as a sample, with the legend hidden', () => {
    const element = render();
    const grid = element.querySelector('.grid');

    expect(grid?.getAttribute('role')).toBe('img');
    expect(grid?.getAttribute('aria-label')).toBe('Sample: 5-day reading streak');
    expect(element.querySelector('.legend')?.getAttribute('aria-hidden')).toBe('true');
  });
});
