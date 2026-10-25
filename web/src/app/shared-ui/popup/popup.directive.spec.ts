import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPopoverShim } from '../../../testing/popover-shim';
import { PopupDirective, PopupTriggerDirective } from './popup.directive';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PopupDirective, PopupTriggerDirective],
  template: `
    <button id="outside" type="button">outside</button>
    <button id="trigger" type="button" [mnPopupTrigger]="panel">open</button>
    <div
      mnPopup
      #panel="mnPopup"
      [menu]="menu()"
      role="menu"
      (opened)="log.push('opened')"
      (closed)="log.push('closed')"
    >
      <button type="button" role="menuitem" id="first">first</button>
      <button type="button" role="menuitem" id="second">second</button>
      <button type="button" role="menuitem" id="third" disabled>third</button>
    </div>
  `,
})
class HostComponent {
  readonly menu = signal(true);
  readonly log: string[] = [];
}

describe('PopupDirective', () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installPopoverShim();
  });

  afterEach(() => {
    uninstall();
  });

  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const byId = (id: string) => element.querySelector<HTMLElement>('#' + id)!;
    return {
      fixture,
      host: fixture.componentInstance,
      trigger: byId('trigger'),
      panel: element.querySelector<HTMLElement>('[role="menu"]')!,
      byId,
    };
  }

  const press = (target: HTMLElement) => {
    target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  };
  const key = (target: HTMLElement, name: string) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  };

  it('is a native auto popover that the trigger names and anchors', () => {
    const { panel, trigger } = render();

    expect(panel.getAttribute('popover')).toBe('auto');
    expect(panel.classList.contains('mn-popup')).toBe(true);
    expect(trigger.getAttribute('popovertarget')).toBe(panel.id);
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(trigger.style.getPropertyValue('anchor-name')).toBe(
      panel.style.getPropertyValue('position-anchor'),
    );
    expect(trigger.style.getPropertyValue('anchor-name')).toMatch(/^--mn-popup-\d+$/);
  });

  it('gives every panel its own id', () => {
    const first = render();
    const second = render();

    expect(first.panel.id).not.toBe(second.panel.id);
  });

  it('states whether it is open and says so once on each change', () => {
    const { fixture, host, trigger } = render();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(host.log).toEqual(['opened', 'closed']);
  });

  it('closes on a press outside, but not on a press inside', () => {
    const { fixture, host, trigger, byId } = render();
    trigger.click();
    fixture.detectChanges();

    press(byId('second'));
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    press(byId('outside'));
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(host.log).toEqual(['opened', 'closed']);
    // A press outside has put focus where the learner pointed; it is not taken back.
    expect(document.activeElement).not.toBe(trigger);
  });

  it('closes on Escape and returns focus to the control that had it', () => {
    const { fixture, trigger, byId } = render();
    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(byId('first'));

    key(byId('first'), 'Escape');
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes itself from code, which is how a chosen item puts it away', () => {
    const { fixture, trigger, panel } = render();
    trigger.click();
    fixture.detectChanges();

    panel.hidePopover();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('reads the state before the panel is shown, so its content is there on the first frame', () => {
    const { fixture, host, trigger, panel } = render();

    panel.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }));
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(host.log).toEqual([]);
  });

  /**
   * A browser that hides a panel because its node moved or was removed fires no
   * toggle event, so the next opening must not be mistaken for the last one.
   */
  it('opens normally again after the browser hid it without a toggle event', () => {
    const { fixture, host, trigger, panel, byId } = render();
    trigger.click();
    fixture.detectChanges();
    expect(host.log).toEqual(['opened']);

    const matches = vi.spyOn(panel, 'matches').mockReturnValue(true);
    panel.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }));
    panel.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
    fixture.detectChanges();

    expect(host.log).toEqual(['opened', 'opened']);
    expect(document.activeElement).toBe(byId('first'));
    matches.mockRestore();
  });

  it('reports a close from the element, not from what it last remembered', () => {
    const { fixture, host, trigger, panel } = render();
    trigger.click();
    fixture.detectChanges();

    const matches = vi.spyOn(panel, 'matches').mockReturnValue(false);
    panel.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }));
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(host.log).toEqual(['opened', 'closed']);
    matches.mockRestore();
  });

  describe('as a menu', () => {
    it('focuses the first item when it opens', () => {
      const { fixture, trigger, byId } = render();
      trigger.click();
      fixture.detectChanges();

      expect(document.activeElement).toBe(byId('first'));
    });

    it('moves with the arrow keys, Home and End, skipping disabled items, and wraps', () => {
      const { fixture, trigger, byId } = render();
      trigger.click();
      fixture.detectChanges();

      key(byId('first'), 'ArrowDown');
      expect(document.activeElement).toBe(byId('second'));
      key(byId('second'), 'ArrowDown');
      expect(document.activeElement).toBe(byId('first'));
      key(byId('first'), 'ArrowUp');
      expect(document.activeElement).toBe(byId('second'));
      key(byId('second'), 'Home');
      expect(document.activeElement).toBe(byId('first'));
      key(byId('first'), 'End');
      expect(document.activeElement).toBe(byId('second'));
    });

    it('leaves focus alone when it is not a menu', () => {
      const { fixture, host, trigger } = render();
      host.menu.set(false);
      fixture.detectChanges();
      trigger.focus();

      trigger.click();
      fixture.detectChanges();

      expect(document.activeElement).toBe(trigger);
    });
  });
});
