import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AppShellComponent } from './app-shell.component';

describe('AppShellComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders a skip link and a focusable main landmark', () => {
    const element = render();

    const skip = element.querySelector('a.mn-skip-link');
    expect(skip?.getAttribute('href')).toBe('#mn-main');

    const main = element.querySelector('main');
    expect(main?.id).toBe('mn-main');
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('carries no application-wide navigation', () => {
    const element = render();

    expect(element.querySelector('nav')).toBeNull();
  });
});
