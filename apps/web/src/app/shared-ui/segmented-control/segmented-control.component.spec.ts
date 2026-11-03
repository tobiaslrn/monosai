import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SegmentedControlComponent, type SegmentedOption } from './segmented-control.component';

type Theme = 'system' | 'light' | 'dark';

const OPTIONS: readonly SegmentedOption<Theme>[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegmentedControlComponent],
  template: `
    <mn-segmented-control
      label="Theme"
      [joined]="joined()"
      [disabled]="disabled()"
      [options]="options"
      [(value)]="theme"
    />
  `,
})
class HostComponent {
  readonly options = OPTIONS;
  readonly theme = signal<Theme | undefined>('light');
  readonly joined = signal(false);
  readonly disabled = signal(false);
}

describe('SegmentedControlComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      group: element.querySelector<HTMLElement>('mn-segmented-control')!,
      radios: () => [...element.querySelectorAll<HTMLInputElement>('input')],
    };
  }

  it('is the shared segmented group, named for assistive technology', () => {
    const { group } = render();

    expect(group.classList.contains('mn-segmented')).toBe(true);
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Theme');
  });

  /** Arrow keys, the roving tab stop and the checked state are the browser's. */
  it('is made of native radios that share one name', () => {
    const { radios } = render();

    expect(radios()).toHaveLength(3);
    expect(radios().every((radio) => radio.type === 'radio')).toBe(true);
    expect(new Set(radios().map((radio) => radio.name)).size).toBe(1);
    expect(radios()[0]!.name).not.toBe('');
  });

  it('labels every option and checks only the one that is the value', () => {
    const { radios, group } = render();

    expect([...group.querySelectorAll('label span')].map((label) => label.textContent)).toEqual([
      'System',
      'Light',
      'Dark',
    ]);
    expect(radios().map((radio) => radio.checked)).toEqual([false, true, false]);
  });

  it('writes the chosen option back through the two-way binding', () => {
    const { fixture, host, radios } = render();

    radios()[2]!.click();
    fixture.detectChanges();

    expect(host.theme()).toBe('dark');
    expect(radios().map((radio) => radio.checked)).toEqual([false, false, true]);
  });

  it('follows a value that changes from outside', () => {
    const { fixture, host, radios } = render();

    host.theme.set('system');
    fixture.detectChanges();

    expect(radios().map((radio) => radio.checked)).toEqual([true, false, false]);
  });

  it('takes the joined variant and can be disabled', () => {
    const { fixture, host, group, radios } = render();
    host.joined.set(true);
    host.disabled.set(true);
    fixture.detectChanges();

    expect(group.classList.contains('mn-segmented--joined')).toBe(true);
    expect(radios().every((radio) => radio.disabled)).toBe(true);
  });
});
