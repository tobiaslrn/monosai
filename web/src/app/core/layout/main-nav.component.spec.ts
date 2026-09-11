import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { MainNavComponent } from './main-nav.component';

@Component({ template: '' })
class Page {}

describe('MainNavComponent', () => {
  async function render(url: string, placement: 'top' | 'bottom' = 'bottom') {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Page }])],
    });
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(MainNavComponent);
    fixture.componentRef.setInput('placement', placement);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('names the three tab pages, in order, as labelled links', async () => {
    const element = await render('/home');

    const nav = element.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Main');
    expect(
      [...element.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
        label: link.textContent.trim(),
        href: link.getAttribute('href'),
      })),
    ).toEqual([
      { label: 'Home', href: '/home' },
      { label: 'Library', href: '/library' },
      { label: 'Settings', href: '/settings' },
    ]);
  });

  /** On a wide screen the mark goes home, and Help is a labelled place after the tabs. */
  it('leaves Home out of the top placement and ends it with Help', async () => {
    const element = await render('/library', 'top');

    expect(
      [...element.querySelectorAll<HTMLAnchorElement>('a')].map((link) => ({
        label: link.textContent.trim(),
        href: link.getAttribute('href'),
      })),
    ).toEqual([
      { label: 'Library', href: '/library' },
      { label: 'Settings', href: '/settings' },
      { label: 'Help', href: '/help' },
    ]);
  });

  it('marks only the current page, including when it carries a query', async () => {
    const element = await render('/settings?from=generate', 'top');

    expect(
      [...element.querySelectorAll('a')].map((link) => link.getAttribute('aria-current')),
    ).toEqual([null, 'page', null]);
  });

  it('marks nothing on a page that is not a tab', async () => {
    const element = await render('/help');

    expect(element.querySelector('[aria-current]')).toBeNull();
  });

  it('carries its placement on the host', async () => {
    const element = await render('/home', 'top');

    expect(element.classList.contains('is-top')).toBe(true);
  });
});
