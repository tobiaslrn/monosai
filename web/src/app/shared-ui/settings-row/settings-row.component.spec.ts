import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { SettingsRowComponent } from './settings-row.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SettingsRowComponent],
  template: `
    <mn-settings-row
      label="Keep data"
      labelId="keep-label"
      action="accent"
      testId="keep"
      (pressed)="presses = presses + 1"
    >
      <span mn-settings-row-detail class="mn-settings-row__hint">Protected</span>
    </mn-settings-row>
    <mn-settings-row label="Space used"><span>3 MB</span></mn-settings-row>
    <mn-settings-row label="Delete" action="danger" [disabled]="true" />
  `,
})
class HostComponent {
  presses = 0;
}

describe('SettingsRowComponent', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** The card's divider rules address rows by this class, as children of the card. */
  it('is itself the settings row', () => {
    const rows = render().querySelectorAll('mn-settings-row');

    expect(rows).toHaveLength(3);
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

    expect(titles[1]!.hasAttribute('id')).toBe(false);
  });

  it('places the detail line under the title', () => {
    const row = render().querySelector('mn-settings-row')!;

    expect(row.querySelector('.mn-settings-row__label .mn-settings-row__hint')?.textContent).toBe(
      'Protected',
    );
    expect(row.querySelector('.mn-settings-row__end .mn-settings-row__hint')).toBeNull();
  });

  it('is one button across the whole row when it is an action', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector('mn-settings-row')!;
    const button = row.querySelector<HTMLButtonElement>('button.mn-settings-press')!;

    expect(button.getAttribute('aria-labelledby')).toBe('keep-label');
    expect(button.getAttribute('data-testid')).toBe('keep');
    expect(row.classList.contains('mn-settings-row--accent')).toBe(true);
    button.click();
    expect(fixture.componentInstance.presses).toBe(1);
  });

  it('has no button unless it is an action, and a disabled action cannot be pressed', () => {
    const rows = render().querySelectorAll('mn-settings-row');

    expect(rows[1]!.querySelector('button')).toBeNull();
    expect(rows[2]!.classList.contains('mn-settings-row--danger')).toBe(true);
    expect(rows[2]!.querySelector('button')!.disabled).toBe(true);
  });
});

describe('SettingsRowComponent kinds', () => {
  @Component({
    imports: [SettingsRowComponent],
    template: `
      <mn-settings-row
        label="Text models"
        end="nav"
        link="/settings/text-models"
        status="success"
        statusText="Ready"
        summary="Model"
      />
      <mn-settings-row label="Space used" value="16 MB" />
      <mn-settings-row label="Voice" end="nav" [disabled]="true" summary="Needs a key" />
    `,
  })
  class KindsHost {}

  function render(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(KindsHost);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('makes the whole navigation row one link, with the status leading its summary', () => {
    const [row] = render().querySelectorAll('mn-settings-row');

    expect(row?.querySelector('a.mn-settings-press')?.getAttribute('href')).toBe(
      '/settings/text-models',
    );
    expect(
      row?.querySelector('.mn-settings-row__details')?.textContent.replace(/\s+/g, ' ').trim(),
    ).toBe('Ready · Model');
    expect(row?.querySelector('.mn-settings-chevron')).not.toBeNull();
  });

  it('puts a fact’s value at the end and makes it nothing to press', () => {
    const fact = render().querySelectorAll('mn-settings-row')[1];

    expect(fact?.querySelector('.mn-settings-row__end .mn-settings-value')?.textContent).toBe(
      '16 MB',
    );
    expect(fact?.querySelector('button, a')).toBeNull();
  });

  it('draws a row that needs setup disabled and not pressable', () => {
    const row = render().querySelectorAll('mn-settings-row')[2];

    expect(row?.classList.contains('mn-settings-row--disabled')).toBe(true);
    expect(row?.querySelector<HTMLButtonElement>('button.mn-settings-press')?.disabled).toBe(true);
  });
});
