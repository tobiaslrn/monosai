import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { HelpIntroBannerComponent } from './help-intro-banner.component';
import { HelpIntroService } from './help-intro.service';

describe('HelpIntroBannerComponent', () => {
  function render(state: { visible?: boolean; saveFailed?: boolean } = {}) {
    const intro = {
      visible: signal(state.visible ?? true),
      saveFailed: signal(state.saveFailed ?? false),
      offer: vi.fn(),
      finish: vi.fn(),
      retrySave: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: HelpIntroService, useValue: intro }],
    });
    const fixture = TestBed.createComponent(HelpIntroBannerComponent);
    fixture.detectChanges();
    return { intro, element: fixture.nativeElement as HTMLElement, fixture };
  }

  /**
   * It shipped as two buttons and nothing else: "Got it" about nothing. The
   * sentence is the only part of it that says what is on offer.
   */
  it('says what it is offering before it offers it', () => {
    const { element } = render();

    const banner = element.querySelector('aside');
    expect(banner?.getAttribute('aria-label')).toBe('A little help getting started');
    expect(banner?.querySelector('p')?.textContent).toContain('New here?');
    expect(
      [...(banner?.querySelectorAll('button') ?? [])].map((button) => button.textContent.trim()),
    ).toEqual(['Read the guide', 'Got it']);
  });

  it('makes the offer when it renders, so nothing spends it on a screen that hides it', () => {
    const { intro } = render();

    expect(intro.offer).toHaveBeenCalledOnce();
  });

  it('carries each choice to the service', () => {
    const { intro, element, fixture } = render();

    element.querySelector<HTMLButtonElement>('aside button')?.click();
    fixture.detectChanges();
    expect(intro.finish).toHaveBeenCalledWith('guide');
  });

  it('offers a retry when the preference could not be saved, without reopening the offer', () => {
    const { intro, element, fixture } = render({ visible: false, saveFailed: true });

    expect(element.querySelector('aside')).toBeNull();
    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Could not save your Help preference');
    alert?.querySelector('button')?.click();
    fixture.detectChanges();
    expect(intro.retrySave).toHaveBeenCalledOnce();
  });
});
