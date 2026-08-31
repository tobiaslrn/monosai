import { Dialog } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openConfirmDialog, type ConfirmDialogData } from './confirm-dialog.component';

/** A host with a button, so focus has somewhere to have come from and go back to. */
@Component({ template: `<button type="button" id="opener">Delete</button>` })
class HostComponent {}

const DATA: ConfirmDialogData = {
  title: 'Delete saved audio for every reading?',
  message: 'This cannot be undone. It permanently removes:',
  details: ['Every generated audio clip, for every reading on this device'],
  footnote: 'Readings and settings are not affected.',
  confirmLabel: 'Delete saved audio',
  cancelLabel: 'Keep it',
  tone: 'danger',
};

/**
 * The one confirmation every destructive action in Monosai opens.
 *
 * What is asserted here is what makes it safe rather than what it looks like:
 * the safe answer is the one focus lands on, Escape and the backdrop resolve to
 * the safe answer rather than to nothing, and the caller can tell the two
 * outcomes apart.
 */
describe('openConfirmDialog', () => {
  let opener: HTMLButtonElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
  });

  async function open(
    data: ConfirmDialogData = DATA,
  ): Promise<{ readonly answer: Promise<boolean>; readonly fixture: ReturnType<typeof render> }> {
    const fixture = render();
    const answer = openConfirmDialog(TestBed.inject(Dialog), data);
    await settle(fixture);
    return { answer, fixture };
  }

  function render(): ReturnType<typeof TestBed.createComponent<HostComponent>> {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    opener = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('#opener')!;
    document.body.append(opener);
    opener.focus();
    return fixture;
  }

  async function settle(fixture: {
    whenStable: () => Promise<unknown>;
    detectChanges: () => void;
  }): Promise<void> {
    for (let pass = 0; pass < 5; pass += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  /**
   * Escape as the overlay reads it.
   *
   * The CDK still filters on `keyCode`, which a constructed `KeyboardEvent`
   * leaves at zero, so the key has to be described both ways for the dialog to
   * see the press a learner makes.
   */
  function pressEscape(): void {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    Object.defineProperty(event, 'keyCode', { get: () => 27 });
    document.querySelector('[role="alertdialog"]')?.dispatchEvent(event);
  }

  function button(label: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll<HTMLButtonElement>('mn-confirm-dialog button')].find(
      (candidate) => candidate.textContent.includes(label),
    );
  }

  it('states what it will remove and what it will not', async () => {
    const { answer, fixture } = await open();

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('every reading on this device');
    expect(dialog?.textContent).toContain('Readings and settings are not affected.');

    button('Keep it')?.click();
    await settle(fixture);
    await expect(answer).resolves.toBe(false);
  });

  /** The dangerous button is never the one a stray Enter or Space presses. */
  it('starts with focus on the safe answer', async () => {
    const { answer, fixture } = await open();

    expect(document.activeElement?.textContent).toContain('Keep it');

    button('Keep it')?.click();
    await settle(fixture);
    await expect(answer).resolves.toBe(false);
  });

  it('treats Escape as keeping it, and returns focus where it came from', async () => {
    const { answer, fixture } = await open();

    pressEscape();
    await settle(fixture);

    await expect(answer).resolves.toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('resolves true only for the destructive button', async () => {
    const { answer, fixture } = await open();

    button('Delete saved audio')?.click();
    await settle(fixture);

    await expect(answer).resolves.toBe(true);
  });
});
