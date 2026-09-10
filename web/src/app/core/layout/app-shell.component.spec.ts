import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AppShellComponent } from './app-shell.component';
import { HelpIntroService } from './help-intro.service';
import { AppUpdateStore } from '../../application/pwa/app-update.store';

@Component({ template: '' })
class Page {}

describe('AppShellComponent', () => {
  async function render(url = '/settings') {
    const intro = { offer: vi.fn(), saveFailed: signal(false), retrySave: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Page }]),
        { provide: AppUpdateStore, useValue: {} },
      ],
    });
    TestBed.overrideComponent(AppShellComponent, {
      set: { providers: [{ provide: HelpIntroService, useValue: intro }] },
    });
    TestBed.overrideTemplate(
      AppShellComponent,
      `<a class="mn-skip-link" href="#mn-main">Skip</a>
      @if (!isReaderRoute()) { <mn-app-bar [showSearch]="isLibraryRoute()" /> }
      <main id="mn-main" tabindex="-1"><router-outlet /></main>`,
    );
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, intro, router, element: fixture.nativeElement as HTMLElement };
  }

  it('renders identity and accessible icon-only utilities', async () => {
    const { element, intro } = await render();
    expect(element.querySelector('.mn-skip-link')?.getAttribute('href')).toBe('#mn-main');
    expect(element.querySelector('main')?.getAttribute('tabindex')).toBe('-1');
    expect(element.querySelector('.identity')?.getAttribute('href')).toBe('/library');
    const links = [...element.querySelectorAll('nav a')];
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual([
      'Settings',
      'Help',
      'GitHub (opens in a new tab)',
    ]);
    for (const link of links) {
      expect(link.textContent.trim()).toBe('');
      expect(link.getAttribute('title')).toBe(link.getAttribute('aria-label'));
    }
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[2].getAttribute('href')).toBe('https://github.com/tobiaslrn/monosai');
    expect(links[2].getAttribute('target')).toBe('_blank');
    expect(links[2].getAttribute('rel')).toContain('noopener');
    expect(intro.offer).toHaveBeenCalled();
  });

  it('defers the intro and hides utilities on a reader deep link, then offers on exit', async () => {
    const { fixture, element, intro, router } = await render(
      '/reader/2f8d3f4e-1b6a-4f7c-9c2e-0d5a6b7c8d9e',
    );
    expect(element.querySelector('mn-app-bar')).toBeNull();
    expect(intro.offer).not.toHaveBeenCalled();
    await router.navigateByUrl('/help');
    fixture.detectChanges();
    expect(element.querySelector('mn-app-bar')).not.toBeNull();
    expect(intro.offer).toHaveBeenCalledOnce();
  });

  it('uses the shared utility bar on the Library and reserves Search there', async () => {
    const { element } = await render('/library');

    expect(element.querySelector('mn-app-bar')).not.toBeNull();
    expect(element.querySelector('nav button[aria-label="Search"]')).not.toBeNull();
  });

  it('uses the shared utility bar on the pages about what you can read', async () => {
    for (const url of ['/reading-level', '/reading-level/vocabulary', '/reading-level/level']) {
      TestBed.resetTestingModule();
      const { element } = await render(url);

      expect(element.querySelector('mn-app-bar')).not.toBeNull();
      expect(element.querySelector('nav button[aria-label="Search"]')).toBeNull();
    }
  });

  it('keeps the utility bar on a page that only shares the prefix', async () => {
    const { element } = await render('/reading-levels');

    expect(element.querySelector('mn-app-bar')).not.toBeNull();
  });

  /**
   * Only the reader goes without chrome. A `/reader/` segment that is not an id
   * never reaches it, and that screen was losing the masthead — and with it
   * every way out of the application — to a prefix match on the URL.
   */
  it('keeps the masthead on a reader link that names no reading', async () => {
    const { element, intro } = await render('/reader/example');

    expect(element.querySelector('mn-app-bar')).not.toBeNull();
    expect(intro.offer).toHaveBeenCalled();
  });
});
