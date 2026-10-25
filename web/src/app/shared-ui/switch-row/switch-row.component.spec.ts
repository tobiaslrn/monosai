import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SwitchRowComponent } from './switch-row.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SwitchRowComponent],
  template: `
    <mn-switch-row testId="furigana" describedBy="reason" [disabled]="disabled()" [(checked)]="on">
      Furigana
    </mn-switch-row>
  `,
})
class HostComponent {
  readonly on = signal(false);
  readonly disabled = signal(false);
}

describe('SwitchRowComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
    return { fixture, host: fixture.componentInstance, input };
  }

  it('is a native checkbox that is a switch, wearing the shared track', () => {
    const { input } = render();

    expect(input.type).toBe('checkbox');
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.classList.contains('mn-switch')).toBe(true);
  });

  it('is named by its visible label, so the whole row is the target', () => {
    const { fixture, input } = render();
    const label = (fixture.nativeElement as HTMLElement).querySelector('label')!;

    expect(label.contains(input)).toBe(true);
    expect(label.textContent.trim()).toBe('Furigana');
  });

  it('puts the test id and the description on the input', () => {
    const { input } = render();

    expect(input.getAttribute('data-testid')).toBe('furigana');
    expect(input.getAttribute('aria-describedby')).toBe('reason');
  });

  it('toggles the bound value from the switch, and the switch from the value', () => {
    const { fixture, host, input } = render();

    input.click();
    fixture.detectChanges();
    expect(host.on()).toBe(true);
    expect(input.checked).toBe(true);

    input.click();
    fixture.detectChanges();
    expect(host.on()).toBe(false);

    host.on.set(true);
    fixture.detectChanges();
    expect(input.checked).toBe(true);
  });

  it('can be disabled', () => {
    const { fixture, host, input } = render();
    host.disabled.set(true);
    fixture.detectChanges();

    expect(input.disabled).toBe(true);
  });
});
