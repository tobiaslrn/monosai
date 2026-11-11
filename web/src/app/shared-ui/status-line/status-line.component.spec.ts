import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StatusLineComponent } from './status-line.component';

@Component({
  imports: [StatusLineComponent],
  template: `
    <mn-status-line tone="danger">
      Test failed.
      <button mn-status-line-action type="button">Test again</button>
    </mn-status-line>
    <mn-status-line tone="success">Ready.</mn-status-line>
  `,
})
class HostComponent {}

describe('StatusLineComponent', () => {
  function render(): HTMLElement[] {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('mn-status-line'),
    ];
  }

  it('announces a failure as an alert and anything else as a status', () => {
    const [failed, ready] = render();

    expect(failed?.getAttribute('role')).toBe('alert');
    expect(ready?.getAttribute('role')).toBe('status');
  });

  it('carries its tone, and puts its one action at the end of the sentence', () => {
    const [failed] = render();

    expect(failed?.getAttribute('data-tone')).toBe('danger');
    expect(failed?.querySelector('.mn-status-line__words button')?.textContent).toBe('Test again');
  });
});
