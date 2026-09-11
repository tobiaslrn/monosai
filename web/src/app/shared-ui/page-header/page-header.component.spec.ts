import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { PageHeaderComponent } from './page-header.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent],
  template: `<mn-page-header
    heading="Vocabulary"
    backTo="/settings"
    backLabel="Back to settings"
  />`,
})
class HostComponent {}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent],
  template: `<mn-page-header heading="Vocabulary"
    ><span data-testid="trailing">Action</span></mn-page-header
  >`,
})
class TrailingHostComponent {}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent],
  template: `<mn-page-header heading="Library" [titleHidden]="true" />`,
})
class HiddenTitleHostComponent {}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent],
  template: `<mn-page-header
    heading="Settings"
    [titleHidden]="true"
    backTo="/generate"
    backLabel="Back to story"
  />`,
})
class HiddenTitleWithBackHostComponent {}

describe('PageHeaderComponent back control', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => {
    history.replaceState(null, '');
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('returns through history when the current entry proves the expected origin', () => {
    history.replaceState(navigationOriginState('/settings'), '');
    const back = vi.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);
    const element = render();

    const control = element.querySelector<HTMLButtonElement>('button.mn-icon-button');
    expect(element.querySelector('a.mn-icon-button')).toBeNull();
    expect(control?.getAttribute('aria-label')).toBe('Back to settings');

    control?.click();

    expect(back).toHaveBeenCalledOnce();
  });

  it('offers a plain link to the fallback for a deep-linked page', () => {
    const element = render();

    const link = element.querySelector<HTMLAnchorElement>('a.mn-icon-button');
    expect(element.querySelector('button.mn-icon-button')).toBeNull();
    expect(link?.getAttribute('aria-label')).toBe('Back to settings');
    expect(link?.getAttribute('href')).toBe('/settings');
  });

  it('navigates rather than popping an entry proven by a different origin', () => {
    history.replaceState(navigationOriginState('/generate'), '');
    const element = render();

    // A link, so the entry proving Generate is left where it is: popping it
    // would leave Vocabulary on a screen the learner never came from.
    expect(element.querySelector('button.mn-icon-button')).toBeNull();
    expect(element.querySelector<HTMLAnchorElement>('a.mn-icon-button')?.getAttribute('href')).toBe(
      '/settings',
    );
  });

  it('projects an optional trailing element into the page header', () => {
    const fixture = TestBed.createComponent(TrailingHostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.trailing [data-testid="trailing"]')?.textContent).toBe('Action');
  });

  /** A tab page's title is the selected tab; the heading survives for screen readers. */
  it('keeps a hidden title as the page heading', () => {
    const fixture = TestBed.createComponent(HiddenTitleHostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const heading = element.querySelector('h1#mn-page-title');
    expect(heading?.textContent.trim()).toBe('Library');
    expect(heading?.querySelector('.mn-visually-hidden')?.textContent).toBe('Library');
    expect(element.querySelector('mn-wordmark')).toBeNull();
    expect(element.querySelector('.head')?.classList.contains('is-bare')).toBe(true);
  });

  it('keeps the bar in place when a hidden-title page still has a way back', () => {
    const fixture = TestBed.createComponent(HiddenTitleWithBackHostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.head')?.classList.contains('is-bare')).toBe(false);
    expect(element.querySelector('.back')?.getAttribute('aria-label')).toBe('Back to story');
  });
});
