import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { IconComponent } from '../icon/icon.component';
import { ListRowComponent } from './list-row.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ListRowComponent],
  template: `
    <mn-list-row [routerLink]="'/library'" [testId]="'shared-row'">
      <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
        <mn-icon name="library" />
      </span>
      <span mn-list-row-title>{{ longTitle }}</span>
      <span mn-list-row-meta>Imported · 940 characters</span>
      <span mn-list-row-trailing>
        <span class="mn-status-pill">New</span>
      </span>
      <span mn-list-row-menu>
        <button type="button" class="mn-icon-button" aria-label="Row actions">
          <mn-icon name="overflow" />
        </button>
      </span>
    </mn-list-row>
  `,
})
class HostComponent {
  readonly longTitle = `A title that wraps ${'語'.repeat(80)}`;
}

describe('ListRowComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('projects the row slots into one native link', () => {
    const element = render();
    const link = element.querySelector<HTMLAnchorElement>('a[data-testid="shared-row"]');

    expect(link).not.toBeNull();
    expect(link?.querySelector('[mn-list-row-leading]')).not.toBeNull();
    expect(link?.querySelector('[mn-list-row-title]')?.textContent).toContain('wraps');
    expect(link?.querySelector('[mn-list-row-meta]')?.textContent).toContain('940 characters');
    expect(link?.querySelector('[mn-list-row-trailing]')).not.toBeNull();
  });

  it('keeps a projected menu button outside the link', () => {
    const element = render();
    const menu = element.querySelector<HTMLButtonElement>('[mn-list-row-menu] button');

    expect(menu?.tagName).toBe('BUTTON');
    expect(menu?.closest('a')).toBeNull();
    expect(element.querySelector('.mn-list-row__menu [mn-list-row-menu]')).not.toBeNull();
  });

  it('keeps long titles in the title slot instead of truncating them', () => {
    const element = render();
    const title = element.querySelector('[mn-list-row-title]');

    expect(title?.textContent).toContain('語'.repeat(80));
    expect(element.querySelector('.mn-list-row__title')).not.toBeNull();
  });
});
