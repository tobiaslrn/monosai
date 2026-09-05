import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { StepperComponent, type StepperStep } from './stepper.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepperComponent],
  template: `<mn-stepper [steps]="steps()" label="Test progress" />`,
})
class HostComponent {
  readonly steps = signal<readonly StepperStep[]>([]);
}

describe('StepperComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  function render(steps: readonly StepperStep[]): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.steps.set(steps);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('names the list so a screen reader can identify it', () => {
    const element = render([{ key: 'a', label: 'First', status: 'active' }]);

    expect(element.querySelector('ol')?.getAttribute('aria-label')).toBe('Test progress');
  });

  it('gives every state a word, not only a colour', () => {
    const element = render([
      { key: 'a', label: 'First', status: 'complete' },
      { key: 'b', label: 'Second', status: 'active' },
      { key: 'c', label: 'Third', status: 'retrying' },
      { key: 'd', label: 'Fourth', status: 'skipped' },
      { key: 'e', label: 'Fifth', status: 'failed' },
      { key: 'f', label: 'Sixth', status: 'pending' },
    ]);

    const statuses = [...element.querySelectorAll('.status')].map((node) =>
      node.textContent.trim(),
    );
    expect(statuses).toEqual([
      'Done',
      'In progress',
      'Retrying',
      'Skipped',
      'Failed',
      'Not started',
    ]);
  });

  it('marks exactly the active step as current', () => {
    const element = render([
      { key: 'a', label: 'First', status: 'complete' },
      { key: 'b', label: 'Second', status: 'active' },
      { key: 'c', label: 'Third', status: 'pending' },
    ]);

    const current = [...element.querySelectorAll('li')].filter(
      (node) => node.getAttribute('aria-current') === 'step',
    );
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Second');
  });

  it('shows a stage detail beside its status when one is supplied', () => {
    const element = render([
      { key: 'a', label: 'Repairing', status: 'retrying', detail: 'attempt 1 of 2' },
    ]);

    expect(element.querySelector('.detail')?.textContent).toContain('attempt 1 of 2');
  });

  it('exposes the status for styling without hiding it from assistive technology', () => {
    const element = render([{ key: 'a', label: 'First', status: 'failed' }]);

    expect(element.querySelector('li')?.getAttribute('data-status')).toBe('failed');
    expect(element.querySelector('.marker')?.getAttribute('aria-hidden')).toBe('true');
  });
});
