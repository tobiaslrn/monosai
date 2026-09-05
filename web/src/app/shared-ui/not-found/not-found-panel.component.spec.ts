import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { BrokenReadingLinkComponent } from '../../features/reader/broken-reading-link.component';
import { NotFoundPanelComponent } from './not-found-panel.component';

@Component({
  imports: [NotFoundPanelComponent],
  template: `
    <mn-not-found-panel
      heading="This story is no longer here"
      [explanation]="['It may have been deleted.']"
      secondaryLink="/generate"
      secondaryLabel="Start a new story"
    />
  `,
})
class HostComponent {}

describe('NotFoundPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('names what was not found and offers the ordinary action pair', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('[role="alert"] h2')?.textContent).toContain('no longer here');
    const actions = [...element.querySelectorAll<HTMLAnchorElement>('.actions a')];
    expect(actions.map((link) => link.textContent.trim())).toEqual([
      'Go to library',
      'Start a new story',
    ]);
    // The library route is the primary one wherever the panel appears.
    expect(actions[0].className).toContain('mn-button--primary');
    expect(actions[0].getAttribute('href')).toBe('/library');
  });

  /**
   * This screen used to render a bare card with no application identity at all,
   * because it lives under a `/reader/` URL the shell stripped chrome from.
   */
  it('gives an unrecognised reading link the same panel and a page header', () => {
    const fixture = TestBed.createComponent(BrokenReadingLinkComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('mn-page-header h1')?.textContent).toContain(
      'Link not recognised',
    );
    expect(element.querySelector('mn-not-found-panel .actions a')?.textContent.trim()).toBe(
      'Go to library',
    );
  });
});
