import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installPopoverShim } from '../../../testing/popover-shim';
import { type SelectOption, type SelectValue, SelectComponent } from './select.component';

@Component({
  imports: [SelectComponent, FormsModule],
  template: `
    <mn-select
      label="Pace"
      [options]="options()"
      [ngModel]="model()"
      (ngModelChange)="model.set($event)"
      (valueChange)="changes.push($event)"
    />
  `,
})
class HostComponent {
  readonly options = signal<readonly SelectOption[]>([
    { value: 'natural', label: 'Natural', description: 'As spoken' },
    { value: 'slow', label: 'Slow' },
    { value: 'broken', label: 'Broken', disabled: true },
    { value: 'very-slow', label: 'Very slow' },
  ]);
  readonly model = signal<SelectValue>('slow');
  readonly changes: SelectValue[] = [];
}

describe('SelectComponent', () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installPopoverShim();
  });

  afterEach(() => {
    uninstall();
  });

  async function render(): Promise<{
    host: HostComponent;
    element: HTMLElement;
    trigger: HTMLButtonElement;
    list: () => HTMLElement;
    press: (key: string, target?: HTMLElement) => void;
    flush: () => void;
    settle: () => Promise<void>;
  }> {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const flush = (): void => {
      fixture.detectChanges();
    };
    return {
      host: fixture.componentInstance,
      element,
      trigger: element.querySelector<HTMLButtonElement>('[role="combobox"]')!,
      list: () => element.querySelector<HTMLElement>('[role="listbox"]')!,
      press: (key, target) => {
        (target ?? document.activeElement ?? element).dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        );
        flush();
      },
      flush,
      settle: async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        await new Promise((resolve) => setTimeout(resolve));
        fixture.detectChanges();
      },
    };
  }

  const optionLabels = (list: HTMLElement): string[] =>
    Array.from(list.querySelectorAll('[role="option"] .mn-dropdown-row__label')).map(
      (label) => label.textContent,
    );

  it('is a select-only combobox over a listbox of options', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const { trigger, list, flush } = await render();

    expect(trigger.textContent.trim()).toBe('Slow');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(list().id);
    expect(trigger.getAttribute('aria-label')).toBe('Pace');

    trigger.click();
    flush();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const options = Array.from(list().querySelectorAll('[role="option"]'));
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(options[2]!.getAttribute('aria-disabled')).toBe('true');
    expect(options[0]!.querySelector('.mn-dropdown-row__description')?.textContent).toBe(
      'As spoken',
    );
    expect(list().getAttribute('aria-activedescendant')).toBe(options[1]!.id);
  });

  it('is named by the label a row points it at', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(SelectComponent);
    fixture.componentRef.setInput('options', [{ value: 'a', label: 'A' }]);
    fixture.componentRef.setInput('labelledBy', 'row-label');
    fixture.detectChanges();
    const trigger = (fixture.nativeElement as HTMLElement).querySelector('[role="combobox"]')!;
    expect(trigger.getAttribute('aria-labelledby')).toBe('row-label');
    expect(trigger.hasAttribute('aria-label')).toBe(false);
  });

  it('opens from the arrow keys and moves over enabled options only', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const { trigger, list, press } = await render();

    press('ArrowDown', trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(list());

    const active = (): string | null =>
      list().querySelector('#' + list().getAttribute('aria-activedescendant')!)?.textContent ??
      null;
    press('ArrowDown');
    expect(active()).toContain('Very slow');
    press('ArrowDown');
    expect(active()).toContain('Very slow');
    press('Home');
    expect(active()).toContain('Natural');
    press('End');
    expect(active()).toContain('Very slow');
    press('ArrowUp');
    expect(active()).toContain('Slow');
  });

  it('types ahead to the option a prefix names', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const { trigger, list, press } = await render();
    press('ArrowDown', trigger);

    press('v');
    press('e');
    expect(
      list().querySelector('#' + list().getAttribute('aria-activedescendant')!)?.textContent,
    ).toContain('Very slow');
  });

  it('chooses with Enter, closes, and hands focus back to the field', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const { host, trigger, list, press, flush } = await render();
    trigger.focus();
    press('ArrowDown', trigger);

    press('Home');
    press('Enter');

    expect(host.changes).toEqual(['natural']);
    expect(host.model()).toBe('natural');
    flush();
    expect(trigger.textContent.trim()).toBe('Natural');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(list().id).not.toBe('');
  });

  it('chooses with a click and never a disabled option', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const { host, trigger, list, flush } = await render();
    trigger.click();
    flush();
    const options = list().querySelectorAll<HTMLElement>('[role="option"]');

    options[2]!.click();
    flush();
    expect(host.changes).toEqual([]);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    options[3]!.click();
    flush();
    expect(host.changes).toEqual(['very-slow']);
    expect(trigger.textContent.trim()).toBe('Very slow');
  });

  it('closes on Escape without choosing', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const { host, trigger, press } = await render();
    trigger.focus();
    press('ArrowDown', trigger);
    press('Home');

    press('Escape', document.body);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(host.changes).toEqual([]);
    expect(document.activeElement).toBe(trigger);
  });

  it('writes a form value without announcing it as a choice', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const { host, trigger, settle } = await render();

    host.model.set('very-slow');
    await settle();

    expect(trigger.textContent.trim()).toBe('Very slow');
    expect(host.changes).toEqual([]);
  });

  it('keeps a number a number', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const { host, trigger, list, flush, settle } = await render();
    host.options.set([
      { value: 1, label: 'One' },
      { value: 2, label: 'Two' },
    ]);
    host.model.set(1);
    await settle();
    trigger.click();
    flush();

    list().querySelectorAll<HTMLElement>('[role="option"]')[1]!.click();

    expect(host.changes).toEqual([2]);
    expect(optionLabels(list())).toEqual(['One', 'Two']);
  });
});
