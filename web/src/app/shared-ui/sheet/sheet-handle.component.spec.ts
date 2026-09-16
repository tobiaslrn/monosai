import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SheetHandleComponent } from './sheet-handle.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetHandleComponent],
  template: `<mn-sheet-handle
    #handle
    label="Close test sheet"
    (dismissed)="closed = closed + 1"
  />`,
})
class HostComponent {
  readonly handle = viewChild.required(SheetHandleComponent);
  closed = 0;
}

describe('SheetHandleComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    Object.defineProperty(button(), 'setPointerCapture', { value: () => undefined });
  });

  function button(): HTMLButtonElement {
    const element = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(element).not.toBeNull();
    return element!;
  }

  function pointer(target: HTMLElement, type: string, clientY: number): void {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientY, pointerId: 1 }));
  }

  it('names the action for assistive technology', () => {
    expect(button().getAttribute('aria-label')).toBe('Close test sheet');
  });

  it('reports the drag distance so the sheet can follow the finger', () => {
    pointer(button(), 'pointerdown', 100);
    pointer(button(), 'pointermove', 145);

    expect(fixture.componentInstance.handle().offset()).toBe(45);
    expect(fixture.componentInstance.handle().dragging()).toBe(true);
  });

  it('ignores an upward drag, which would leave a gap below a docked sheet', () => {
    pointer(button(), 'pointerdown', 100);
    pointer(button(), 'pointermove', 40);

    expect(fixture.componentInstance.handle().offset()).toBe(0);
  });

  it('springs back after a short drag without dismissing', () => {
    pointer(button(), 'pointerdown', 100);
    pointer(button(), 'pointermove', 140);
    pointer(button(), 'pointerup', 140);
    button().click();

    expect(fixture.componentInstance.closed).toBe(0);
    expect(fixture.componentInstance.handle().offset()).toBe(0);
  });

  it('emits one dismissal after a drag reaches the threshold', () => {
    pointer(button(), 'pointerdown', 100);
    pointer(button(), 'pointermove', 181);
    pointer(button(), 'pointerup', 181);
    button().click();

    expect(fixture.componentInstance.closed).toBe(1);
  });

  it('dismisses on a plain press, for keyboard and touch users', () => {
    button().click();

    expect(fixture.componentInstance.closed).toBe(1);
  });
});
