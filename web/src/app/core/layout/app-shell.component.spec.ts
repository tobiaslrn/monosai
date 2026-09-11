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
      @if (!isReaderRoute()) { <p class="chrome">non-reader</p> }
      <main id="mn-main" tabindex="-1"><router-outlet /></main>`,
    );
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, intro, router, element: fixture.nativeElement as HTMLElement };
  }

  it('renders the skip link and a focusable main landmark, and offers the guide', async () => {
    const { element, intro } = await render();
    expect(element.querySelector('.mn-skip-link')?.getAttribute('href')).toBe('#mn-main');
    expect(element.querySelector('main')?.getAttribute('tabindex')).toBe('-1');
    expect(intro.offer).toHaveBeenCalled();
  });

  it('defers the intro and drops non-reader chrome on a reader deep link', async () => {
    const { fixture, element, intro, router } = await render(
      '/reader/2f8d3f4e-1b6a-4f7c-9c2e-0d5a6b7c8d9e',
    );
    expect(element.querySelector('.chrome')).toBeNull();
    expect(intro.offer).not.toHaveBeenCalled();
    await router.navigateByUrl('/help');
    fixture.detectChanges();
    expect(element.querySelector('.chrome')).not.toBeNull();
    expect(intro.offer).toHaveBeenCalledOnce();
  });

  /**
   * Only the reader goes without chrome. A `/reader/` segment that is not an id
   * never reaches it, and that screen was losing every way out of the
   * application to a prefix match on the URL.
   */
  it('keeps non-reader chrome on a reader link that names no reading', async () => {
    const { element, intro } = await render('/reader/example');

    expect(element.querySelector('.chrome')).not.toBeNull();
    expect(intro.offer).toHaveBeenCalled();
  });
});
