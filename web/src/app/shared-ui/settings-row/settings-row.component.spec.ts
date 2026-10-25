import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SettingsRowComponent } from './settings-row.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SettingsRowComponent],
  template: `
    <mn-settings-row label="Keep data" labelId="keep-label" [actions]="true">
      <span mn-settings-row-detail class="mn-settings-row__hint">Protected</span>
      <button type="button" aria-labelledby="keep-label">Protect</button>
    </mn-settings-row>
    <mn-settings-row label="Space used"><span>3 MB</span></mn-settings-row>
  `,
})
class HostComponent {}

describe('SettingsRowComponent', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** The card's divider rules address rows by this class, as children of the card. */
  it('is itself the settings row', () => {
    const rows = render().querySelectorAll('mn-settings-row');

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.classList.contains('mn-settings-row')).toBe(true);
    }
  });

  it('shows the title and gives controls an id to be labelled by', () => {
    const title = render().querySelector('.mn-settings-row__title');

    expect(title?.textContent).toBe('Keep data');
    expect(title?.id).toBe('keep-label');
  });

  it('leaves the title without an id when none is asked for', () => {
    const titles = render().querySelectorAll('.mn-settings-row__title');

    expect(titles[1].hasAttribute('id')).toBe(false);
  });

  it('places the detail line under the title and the control at the end', () => {
    const row = render().querySelector('mn-settings-row')!;

    expect(row.querySelector('.mn-settings-row__label .mn-settings-row__hint')?.textContent).toBe(
      'Protected',
    );
    expect(row.querySelector('.mn-settings-row__end button')).not.toBeNull();
    expect(row.querySelector('.mn-settings-row__end .mn-settings-row__hint')).toBeNull();
  });

  it('lays the end slot out as the actions row only when asked', () => {
    const ends = render().querySelectorAll('.mn-settings-row__end');

    expect(ends[0].classList.contains('mn-actions')).toBe(true);
    expect(ends[1].classList.contains('mn-actions')).toBe(false);
  });
});
