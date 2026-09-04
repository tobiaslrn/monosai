import {
  ChangeDetectionStrategy,
  Component,
  inject,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import type { ElementRef, TemplateRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeMatchMedia, type FakeMediaMatcher } from '../../../testing/match-media';
import { PopoverService, type PopoverRef } from './popover.service';
import { ReaderPopoverComponent } from './reader-popover.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReaderPopoverComponent],
  template: `
    <button #anchor type="button">anchor</button>
    <button #word type="button" class="token">猫</button>

    <ng-template #previewContent>
      <span class="preview-body">ねこ — cat</span>
    </ng-template>

    <ng-template #content>
      <mn-reader-popover label="Word details">
        <button type="button" class="inside">first</button>
        <button type="button">second</button>
      </mn-reader-popover>
    </ng-template>
  `,
})
class HostComponent {
  readonly anchor = viewChild.required<ElementRef<HTMLButtonElement>>('anchor');
  readonly word = viewChild.required<ElementRef<HTMLButtonElement>>('word');
  readonly content = viewChild.required<TemplateRef<unknown>>('content');
  readonly previewContent = viewChild.required<TemplateRef<unknown>>('previewContent');
  readonly viewContainerRef = inject(ViewContainerRef);
  readonly popover = inject(PopoverService);

  closedCount = 0;

  open(mobileSheet?: boolean, retargetSelector?: string): PopoverRef {
    return this.popover.open({
      origin: this.anchor(),
      template: this.content(),
      viewContainerRef: this.viewContainerRef,
      mobileSheet,
      retargetSelector,
      returnFocusTo: this.anchor().nativeElement,
      onClosed: () => {
        this.closedCount += 1;
      },
    });
  }
}

describe('PopoverService', () => {
  let media: FakeMediaMatcher;

  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function pane(): HTMLElement | null {
    return document.querySelector('.mn-popover-pane');
  }

  function press(target: HTMLElement, clientX: number, clientY: number): void {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX, clientY }));
  }

  function release(target: HTMLElement, clientX: number, clientY: number): void {
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX, clientY }));
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    media = installFakeMatchMedia(1440);
  });

  afterEach(async () => {
    TestBed.inject(PopoverService).close();
    media.restore();
    // A dismissal arms a one-shot guard against the click it was answering,
    // disarmed on the next macrotask. Letting that run keeps one test's
    // dismissal from eating the first click of the next one.
    await new Promise((resolve) => {
      setTimeout(resolve);
    });
  });

  it('renders the content in an overlay with a labelled dialog', () => {
    const fixture = render();
    fixture.componentInstance.open();
    fixture.detectChanges();

    const dialog = pane()?.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-label')).toBe('Word details');
  });

  it('moves focus into the popover and back to the origin when it closes', () => {
    const fixture = render();
    const anchor = fixture.componentInstance.anchor().nativeElement;
    anchor.focus();

    const ref = fixture.componentInstance.open();
    fixture.detectChanges();
    expect(pane()?.contains(document.activeElement)).toBe(true);

    ref.close();
    fixture.detectChanges();
    expect(document.activeElement).toBe(anchor);
    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  it('closes on Escape', () => {
    const fixture = render();
    const anchor = fixture.componentInstance.anchor().nativeElement;
    anchor.focus();
    fixture.componentInstance.open();
    fixture.detectChanges();

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(pane()).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it('closes on a click away', () => {
    const fixture = render();
    const anchor = fixture.componentInstance.anchor().nativeElement;
    anchor.focus();
    fixture.componentInstance.open();
    fixture.detectChanges();

    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();
    fixture.detectChanges();

    expect(pane()).toBeNull();
    expect(fixture.componentInstance.closedCount).toBe(1);
    expect(document.activeElement).toBe(anchor);
  });

  /**
   * A press outside a docked sheet is as often the start of a scroll as it is a
   * dismissal, and closing on the press meant a reader could not read on with a
   * translation still open.
   */
  it('dismisses on a tap outside, and leaves a scroll outside alone', () => {
    const fixture = render();
    fixture.componentInstance.open();
    fixture.detectChanges();

    press(document.body, 40, 200);
    release(document.body, 40, 60);
    fixture.detectChanges();
    expect(pane()).not.toBeNull();

    press(document.body, 40, 200);
    release(document.body, 42, 203);
    fixture.detectChanges();
    expect(pane()).toBeNull();
    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  /**
   * Dismissal normally eats the click it was answering. A word is the
   * exception: without this, every tap on the next word was spent closing the
   * card over the previous one, and a reader had to tap the same word twice.
   * The surface is left standing so that the click can decide — which is what
   * lets a press on the open word put it away rather than reopen it.
   */
  it('leaves a tap on a retargetable element to its own click', () => {
    const fixture = render();
    fixture.componentInstance.open(undefined, 'button.token');
    fixture.detectChanges();
    const word = fixture.componentInstance.word().nativeElement;
    let clicked = 0;
    word.addEventListener('click', () => {
      clicked += 1;
    });

    press(word, 10, 10);
    release(word, 10, 10);
    word.click();
    fixture.detectChanges();

    expect(pane()).not.toBeNull();
    expect(fixture.componentInstance.closedCount).toBe(0);
    expect(clicked).toBe(1);
  });

  it('still eats the click of a tap that only dismisses', () => {
    const fixture = render();
    fixture.componentInstance.open(undefined, 'button.token');
    fixture.detectChanges();
    let clicked = 0;
    document.body.addEventListener('click', () => {
      clicked += 1;
    });

    press(document.body, 40, 200);
    release(document.body, 40, 200);
    document.body.click();
    fixture.detectChanges();

    expect(pane()).toBeNull();
    expect(clicked).toBe(0);
  });

  it('leaves a press inside the popover alone', () => {
    const fixture = render();
    fixture.componentInstance.open();
    fixture.detectChanges();
    const inside = pane()?.querySelector<HTMLElement>('.inside');

    press(inside!, 10, 10);
    release(inside!, 10, 10);
    fixture.detectChanges();

    expect(pane()).not.toBeNull();
  });

  it('keeps only one popover open at a time', () => {
    const fixture = render();
    fixture.componentInstance.open();
    fixture.componentInstance.open();
    fixture.detectChanges();

    expect(document.querySelectorAll('.mn-popover-pane')).toHaveLength(1);
  });

  it('docks as a sheet below the desktop breakpoint', () => {
    media.setWidth(412);
    const fixture = render();
    fixture.componentInstance.open();
    fixture.detectChanges();

    expect(pane()?.classList.contains('is-sheet')).toBe(true);
  });

  it('anchors rather than docking on a desktop viewport', () => {
    const fixture = render();
    fixture.componentInstance.open();
    fixture.detectChanges();

    expect(pane()?.classList.contains('is-sheet')).toBe(false);
  });

  it('can keep a modal reader surface anchored on a mobile viewport', () => {
    media.setWidth(412);
    const fixture = render();
    fixture.componentInstance.open(false);
    fixture.detectChanges();

    expect(pane()?.classList.contains('is-sheet')).toBe(false);
  });

  it('moves an open reader surface with a viewport breakpoint change', () => {
    const fixture = render();
    fixture.componentInstance.open();
    fixture.detectChanges();

    expect(pane()?.classList.contains('is-sheet')).toBe(false);

    media.setWidth(412);
    fixture.detectChanges();
    expect(pane()?.classList.contains('is-sheet')).toBe(true);

    media.setWidth(1440);
    fixture.detectChanges();
    expect(pane()?.classList.contains('is-sheet')).toBe(false);
  });

  it('opens a preview without a backdrop, and without taking focus', () => {
    const fixture = render();
    const anchor = fixture.componentInstance.anchor().nativeElement;
    anchor.focus();

    fixture.componentInstance.popover.open({
      origin: anchor,
      template: fixture.componentInstance.previewContent(),
      viewContainerRef: fixture.componentInstance.viewContainerRef,
      modal: false,
    });
    fixture.detectChanges();

    expect(pane()?.classList.contains('is-preview')).toBe(true);
    expect(pane()?.textContent).toContain('ねこ — cat');
    expect(document.querySelector('.cdk-overlay-backdrop')).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });
});
