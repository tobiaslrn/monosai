import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, viewChild, type TemplateRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { PageHeaderComponent } from './page-header.component';
import { PageNoticeSlot } from './page-notice-slot';

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
  template: `<mn-page-header heading="Library" [home]="true" [showAlpha]="true" />`,
})
class AlphaHostComponent {}

describe('PageHeaderComponent back control', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('gives the icon-only back link a tooltip that matches its name', () => {
    const back = render().querySelector('.back');
    expect(back?.getAttribute('aria-label')).toBe('Back to settings');
    expect(back?.getAttribute('title')).toBe('Back to settings');
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

  it('shows the alpha marker over the home icon when requested', () => {
    const fixture = TestBed.createComponent(AlphaHostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.alpha-marker')?.textContent).toBe('α');
    expect(element.querySelector('.alpha-marker')?.getAttribute('aria-label')).toBe(
      'Alpha version',
    );
  });
});

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent],
  template: `<ng-template #notice><p data-testid="frame-notice">New here?</p></ng-template>
    <mn-page-header heading="Library" />`,
})
class NoticeHostComponent {
  readonly notice = viewChild.required<TemplateRef<unknown>>('notice');
}

describe('PageHeaderComponent frame notice', () => {
  it('draws the frame notice after the bar, as the page’s first block', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), PageNoticeSlot] });
    const fixture = TestBed.createComponent(NoticeHostComponent);
    fixture.detectChanges();
    TestBed.inject(PageNoticeSlot).template.set(fixture.componentInstance.notice());
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const notice = element.querySelector('[data-testid="frame-notice"]');
    expect(notice).not.toBeNull();
    expect(element.querySelector('header')?.nextElementSibling).toBe(notice);
  });

  it('draws nothing extra without a frame', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NoticeHostComponent);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="frame-notice"]'),
    ).toBeNull();
  });
});
