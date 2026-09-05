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
});
