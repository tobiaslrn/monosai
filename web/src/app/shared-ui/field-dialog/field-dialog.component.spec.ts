import { Dialog } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openFieldDialog, type FieldDialogRequest } from './field-dialog.component';

@Component({ template: `<button type="button" id="opener">Token limit</button>` })
class HostComponent {}

const REQUEST: FieldDialogRequest = {
  title: 'Token limit',
  label: 'Tokens',
  value: '16384',
  hint: 'Up to 65,536 tokens',
  inputMode: 'numeric',
  problem: (entry) =>
    /^\d+$/.test(entry) && Number(entry) <= 65_536 ? null : 'Use a whole number up to 65,536.',
  testId: 'limit',
};

/**
 * A typed value in Settings, asked for in a dialog: one labelled field, its
 * hint, and a danger line that replaces the hint while the entry is wrong.
 */
describe('openFieldDialog', () => {
  let opener: HTMLButtonElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
  });

  async function settle(fixture: {
    whenStable: () => Promise<unknown>;
    detectChanges: () => void;
  }): Promise<void> {
    for (let pass = 0; pass < 5; pass += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function open(request: FieldDialogRequest = REQUEST): Promise<{
    readonly answer: Promise<string | null>;
    readonly fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  }> {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    opener = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('#opener')!;
    document.body.append(opener);
    opener.focus();
    const answer = openFieldDialog(TestBed.inject(Dialog), request);
    await settle(fixture);
    return { answer, fixture };
  }

  const input = (): HTMLInputElement =>
    document.querySelector<HTMLInputElement>('mn-field-dialog input')!;
  const save = (): HTMLButtonElement =>
    document.querySelector<HTMLButtonElement>('mn-field-dialog button[type="submit"]')!;

  function type(fixture: { detectChanges: () => void }, text: string): void {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('is a task dialog titled by the row, with one labelled field on the stored value', async () => {
    await open();

    expect(document.querySelector('mn-field-dialog h2')?.textContent).toBe('Token limit');
    expect(document.querySelector('mn-field-dialog label')?.textContent).toContain('Tokens');
    expect(input().value).toBe('16384');
    expect(input().getAttribute('inputmode')).toBe('numeric');
    expect(document.querySelector('mn-field-dialog .mn-hint')?.textContent).toBe(
      'Up to 65,536 tokens',
    );
    expect(save().textContent.trim()).toBe('Save');
    expect(document.querySelector('mn-field-dialog button[mnButton="ghost"]')).toBeNull();
  });

  it('puts one danger line where the hint was while the entry is wrong', async () => {
    const { fixture } = await open();

    type(fixture, 'many');

    expect(document.querySelector('mn-field-dialog .mn-field-error')?.textContent).toContain(
      'Use a whole number up to 65,536.',
    );
    expect(document.querySelector('mn-field-dialog .mn-hint')).toBeNull();
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(save().disabled).toBe(true);

    type(fixture, '2000');

    expect(document.querySelector('mn-field-dialog .mn-field-error')).toBeNull();
    expect(document.querySelector('mn-field-dialog .mn-hint')).not.toBeNull();
    expect(save().disabled).toBe(false);
  });

  it('answers with the entry when Save is pressed', async () => {
    const { answer, fixture } = await open();

    type(fixture, '20000');
    save().click();
    await settle(fixture);

    await expect(answer).resolves.toBe('20000');
  });

  it('answers with nothing when it is put away, and hands focus back', async () => {
    const { answer, fixture } = await open();

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    Object.defineProperty(event, 'keyCode', { get: () => 27 });
    document.querySelector('[role="dialog"]')!.dispatchEvent(event);
    await settle(fixture);

    await expect(answer).resolves.toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
