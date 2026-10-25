import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { RadioCardGroupComponent } from './radio-card-group.component';
import { RadioCardComponent } from './radio-card.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RadioCardComponent, RadioCardGroupComponent],
  template: `
    <mn-radio-card-group
      label="Reading level"
      name="level"
      [disabled]="disabled()"
      [(value)]="picked"
    >
      @for (option of options; track option) {
        <mn-radio-card [value]="option" [inset]="inset()">
          <span class="title">{{ option }}</span>
          <span mn-radio-card-end class="end">end</span>
          <button mn-radio-card-extra type="button" class="extra">Edit {{ option }}</button>
        </mn-radio-card>
      }
    </mn-radio-card-group>
  `,
})
class HostComponent {
  readonly options = ['starter', 'basic', 'plain'] as const;
  readonly picked = signal<string | undefined>('basic');
  readonly inset = signal(false);
  readonly disabled = signal(false);
}

describe('RadioCardComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      element,
      radios: () => [...element.querySelectorAll<HTMLInputElement>('input')],
    };
  }

  it('is a labelled radiogroup of native radios under the group name', () => {
    const { element, radios } = render();
    const group = element.querySelector('mn-radio-card-group')!;

    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Reading level');
    expect(radios().every((radio) => radio.type === 'radio' && radio.name === 'level')).toBe(true);
  });

  it('derives which card is checked once, from the group value', () => {
    const { fixture, host, radios } = render();
    expect(radios().map((radio) => radio.checked)).toEqual([false, true, false]);

    host.picked.set('plain');
    fixture.detectChanges();

    expect(radios().map((radio) => radio.checked)).toEqual([false, false, true]);
  });

  it('writes the picked card back to the group, and mirrors nothing in a class', () => {
    const { fixture, host, element, radios } = render();

    radios()[0].click();
    fixture.detectChanges();

    expect(host.picked()).toBe('starter');
    expect(element.querySelectorAll('.is-selected')).toHaveLength(0);
  });

  it('puts the body and the end inside the choosing label, and extras outside it', () => {
    const { element } = render();
    const card = element.querySelector('mn-radio-card')!;
    const label = card.querySelector('label')!;

    expect(label.querySelector('.title')).not.toBeNull();
    expect(label.querySelector('.end')).not.toBeNull();
    expect(label.querySelector('.extra')).toBeNull();
    expect(card.querySelector('.extra')?.parentElement).toBe(card);
  });

  it('disables every radio when the group is disabled', () => {
    const { fixture, host, radios } = render();

    host.disabled.set(true);
    fixture.detectChanges();

    expect(radios().every((radio) => radio.disabled)).toBe(true);
  });

  it('is the shared option card, sunken when it sits inside the card that offers it', () => {
    const { fixture, host, element } = render();
    const card = element.querySelector('mn-radio-card')!;
    expect(card.classList.contains('mn-option-card')).toBe(true);
    expect(card.classList.contains('mn-option-card--inset')).toBe(false);

    host.inset.set(true);
    fixture.detectChanges();

    expect(card.classList.contains('mn-option-card--inset')).toBe(true);
  });
});
