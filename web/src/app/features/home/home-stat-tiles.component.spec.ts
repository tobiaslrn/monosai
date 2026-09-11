import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { HomeStatTilesComponent, type ReadingFigures } from './home-stat-tiles.component';

function render(figures: ReadingFigures): HTMLElement {
  const fixture = TestBed.createComponent(HomeStatTilesComponent);
  fixture.componentRef.setInput('figures', figures);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('HomeStatTilesComponent', () => {
  it('shows three figures, each with its label', () => {
    const element = render({ storiesRead: 14, thisWeek: 3, charactersRead: 12_500 });

    const tiles = [...element.querySelectorAll('li')].map((tile) => ({
      shown: tile.querySelector('.value')?.textContent.trim(),
      label: tile.querySelector('.label')?.textContent.trim(),
    }));
    expect(tiles).toEqual([
      { shown: '14', label: 'stories read' },
      { shown: '3', label: 'this week' },
      { shown: '12.5K', label: 'characters read' },
    ]);
  });

  /** "12.5K" is a picture of a number; a screen reader gets the number. */
  it('says a shortened figure in full to assistive technology', () => {
    const element = render({ storiesRead: 14, thisWeek: 3, charactersRead: 12_500 });
    const characters = element.querySelectorAll('li')[2];

    expect(characters.querySelector('.value')?.getAttribute('aria-hidden')).toBe('true');
    expect(characters.querySelector('.mn-visually-hidden')?.textContent.trim()).toBe('12,500');
  });
});
