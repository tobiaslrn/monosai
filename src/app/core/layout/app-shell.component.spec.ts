import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeMatchMedia, type FakeMediaMatcher } from '../../../testing/match-media';
import { AppShellComponent } from './app-shell.component';

describe('AppShellComponent', () => {
  let media: FakeMediaMatcher;

  beforeEach(() => {
    media = installFakeMatchMedia(1280);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => {
    media.restore();
  });

  function render() {
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a skip link and a focusable main landmark', () => {
    const element = render().nativeElement as HTMLElement;

    const skip = element.querySelector('a.mn-skip-link');
    expect(skip?.getAttribute('href')).toBe('#mn-main');

    const main = element.querySelector('main');
    expect(main?.id).toBe('mn-main');
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('shows the sidebar navigation on desktop widths', () => {
    const element = render().nativeElement as HTMLElement;

    expect(element.querySelector('mn-sidebar-nav')).not.toBeNull();
    expect(element.querySelector('mn-bottom-nav')).toBeNull();
    expect(element.querySelector('nav')?.getAttribute('aria-label')).toBe('Primary');
  });

  it('shows bottom navigation on mobile widths', () => {
    media.setWidth(1280);
    const fixture = render();
    media.setWidth(400);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('mn-bottom-nav')).not.toBeNull();
    expect(element.querySelector('mn-sidebar-nav')).toBeNull();
  });

  it('labels every navigation destination with visible text', () => {
    const element = render().nativeElement as HTMLElement;
    const links = [...element.querySelectorAll('mn-sidebar-nav a')];

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.textContent.trim().length).toBeGreaterThan(0);
      expect(link.getAttribute('href')).toBeTruthy();
    }
  });
});
