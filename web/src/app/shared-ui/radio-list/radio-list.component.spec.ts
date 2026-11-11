import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { RadioListComponent, type RadioListOption } from './radio-list.component';

const OPTIONS: readonly RadioListOption[] = [
  { value: 'natural', label: 'Natural', description: 'Ordinary rate' },
  { value: 'slow', label: 'Slow' },
];

@Component({
  imports: [RadioListComponent],
  template: `<mn-radio-list
    label="Pace"
    [options]="options"
    [value]="value()"
    (valueChange)="value.set($event)"
  />`,
})
class HostComponent {
  readonly options = OPTIONS;
  readonly value = signal<string | null>('natural');
}

describe('RadioListComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      radios: () => [...element.querySelectorAll<HTMLInputElement>('input[type="radio"]')],
      element,
    };
  }

  it('is a named radio group of settings rows with native radios under one name', () => {
    const { element, radios } = render();

    expect(element.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Pace');
    expect(element.querySelectorAll('.mn-settings-row--radio')).toHaveLength(2);
    expect(new Set(radios().map((radio) => radio.name)).size).toBe(1);
  });

  it('checks the value, names each radio by its label and describes it by its line', () => {
    const { element, radios } = render();

    expect(radios().map((radio) => radio.checked)).toEqual([true, false]);
    expect(element.querySelector('.mn-settings-row__details')?.textContent).toBe('Ordinary rate');
    expect(radios()[0]?.getAttribute('aria-describedby')).not.toBeNull();
    expect(radios()[1]?.getAttribute('aria-describedby')).toBeNull();
  });

  it('reports a choice', () => {
    const { fixture, host, radios } = render();

    radios()[1]?.click();
    fixture.detectChanges();

    expect(host.value()).toBe('slow');
  });
});
