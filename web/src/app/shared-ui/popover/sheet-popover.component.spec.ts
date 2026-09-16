import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeMatchMedia, type FakeMediaMatcher } from '../../../testing/match-media';
import { SheetPopoverComponent } from './sheet-popover.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetPopoverComponent],
  template: `
    <mn-sheet-popover #sheet popover anchorName="--test-anchor" closeLabel="Close test sheet">
      <p>Sheet content</p>
    </mn-sheet-popover>
  `,
})
class HostComponent {
  readonly sheet = viewChild.required(SheetPopoverComponent);
}

describe('SheetPopoverComponent', () => {
  let media: FakeMediaMatcher;

  beforeEach(() => {
    TestBed.resetTestingModule();
    media = installFakeMatchMedia(412);
  });

  afterEach(() => {
    media.restore();
  });

  function render(): {
    readonly fixture: ComponentFixture<HostComponent>;
    readonly sheet: HTMLElement;
  } {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const sheet = element.querySelector<HTMLElement>('mn-sheet-popover')!;
    return { fixture, sheet };
  }

  function handle(sheet: HTMLElement): HTMLButtonElement {
    const button = sheet.querySelector<HTMLButtonElement>('.handle');
    expect(button).not.toBeNull();
    const result = button!;
    Object.defineProperty(result, 'setPointerCapture', { value: () => undefined });
    return result;
  }

  function pointer(target: HTMLElement, type: string, clientY: number): void {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientY, pointerId: 1 }));
  }

  it('renders a real accessible handle on a mobile viewport', () => {
    const { sheet } = render();

    expect(handle(sheet).getAttribute('aria-label')).toBe('Close test sheet');
  });

  it('springs back after a short drag without closing', () => {
    const { fixture, sheet } = render();
    let closed = 0;
    fixture.componentInstance.sheet().closed.subscribe(() => {
      closed += 1;
    });
    const button = handle(sheet);

    pointer(button, 'pointerdown', 100);
    pointer(button, 'pointermove', 140);
    fixture.detectChanges();
    expect(sheet.style.transform).toContain('40px');
    pointer(button, 'pointerup', 140);
    fixture.detectChanges();
    button.click();

    expect(closed).toBe(0);
    expect(sheet.style.transform).toBe('');
  });

  it('emits one close after a drag reaches the dismissal threshold', () => {
    const { fixture, sheet } = render();
    let closed = 0;
    fixture.componentInstance.sheet().closed.subscribe(() => {
      closed += 1;
    });
    const button = handle(sheet);

    pointer(button, 'pointerdown', 100);
    pointer(button, 'pointermove', 181);
    pointer(button, 'pointerup', 181);
    button.click();

    expect(closed).toBe(1);
  });

  it('does not render the mobile handle on a desktop viewport', () => {
    media.setWidth(1440);
    const { sheet } = render();

    expect(sheet.querySelector('.handle')).toBeNull();
  });

  it('anchors to its trigger on desktop but not once docked as a sheet', () => {
    media.setWidth(1440);
    expect(render().sheet.style.getPropertyValue('position-anchor')).toBe('--test-anchor');

    TestBed.resetTestingModule();
    media.setWidth(412);

    // A docked sheet spans the viewport, so keeping the anchor would inset it to
    // the trigger's edge and leave a bare strip down the side.
    expect(render().sheet.style.getPropertyValue('position-anchor')).toBe('');
  });
});
