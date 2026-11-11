import { Dialog } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeCredentialRepository } from '../../../testing/ai-fakes';
import { CredentialStore } from '../../application/settings/credential.store';
import { CREDENTIAL_REPOSITORY } from '../../application/shared/repository-tokens';
import {
  openOpenRouterKeyDialog,
  type OpenRouterKeyOutcome,
} from './openrouter-key-dialog.component';

@Component({ template: `<button type="button" id="opener">OpenRouter key</button>` })
class HostComponent {}

/**
 * The one place a key is typed: a secret field, one danger line under it for a
 * blank entry or a key OpenRouter refused, Delete key only while one is saved.
 */
describe('openOpenRouterKeyDialog', () => {
  let repository: FakeCredentialRepository;
  let refused = false;

  beforeEach(() => {
    refused = false;
    repository = new FakeCredentialRepository(null);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: CREDENTIAL_REPOSITORY, useValue: repository }],
    });
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

  async function open(saved = false): Promise<{
    readonly outcome: Promise<OpenRouterKeyOutcome | undefined>;
    readonly fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  }> {
    if (saved) {
      repository = new FakeCredentialRepository('sk-or-saved');
      TestBed.overrideProvider(CREDENTIAL_REPOSITORY, { useValue: repository });
    }
    await TestBed.inject(CredentialStore).load();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const outcome = openOpenRouterKeyDialog(TestBed.inject(Dialog), { refused: () => refused });
    await settle(fixture);
    return { outcome, fixture };
  }

  const input = (): HTMLInputElement =>
    document.querySelector<HTMLInputElement>('mn-openrouter-key-dialog input')!;
  const save = (): HTMLButtonElement =>
    document.querySelector<HTMLButtonElement>('[data-testid="save-key"]')!;
  const line = (): string | undefined =>
    document.querySelector('mn-openrouter-key-dialog .mn-field-error')?.textContent.trim();

  function type(fixture: { detectChanges: () => void }, text: string): void {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('asks for the key in a masked field with no autofill, and offers Connect', async () => {
    await open();

    expect(document.querySelector('mn-openrouter-key-dialog h2')?.textContent).toBe(
      'OpenRouter key',
    );
    expect(input().type).toBe('password');
    expect(input().autocomplete).toBe('off');
    expect(save().textContent.trim()).toBe('Connect');
    expect(document.querySelector('[data-testid="delete-key"]')).toBeNull();
    expect(document.querySelector<HTMLAnchorElement>('mn-openrouter-key-dialog a')?.href).toContain(
      'openrouter.ai',
    );
  });

  it('shows the key on request and masks it again', async () => {
    const { fixture } = await open();
    const show = document.querySelector<HTMLButtonElement>('button[aria-label="Show"]')!;

    show.click();
    fixture.detectChanges();
    expect(input().type).toBe('text');
    expect(show.getAttribute('aria-pressed')).toBe('true');

    show.click();
    fixture.detectChanges();
    expect(input().type).toBe('password');
  });

  it('says so under the field when there is nothing to save, and saves nothing', async () => {
    const { fixture } = await open();

    save().click();
    fixture.detectChanges();
    expect(line()).toContain('Enter your OpenRouter key.');

    type(fixture, '   ');
    save().click();
    fixture.detectChanges();
    expect(line()).toContain('Enter your OpenRouter key.');
    expect(TestBed.inject(CredentialStore).isConfigured()).toBe(false);

    type(fixture, 'sk-or-new');
    expect(line()).toBeUndefined();
  });

  it('saves the key and closes with it', async () => {
    const { outcome, fixture } = await open();

    type(fixture, 'sk-or-new');
    save().click();
    await settle(fixture);

    await expect(outcome).resolves.toBe('saved');
    expect(TestBed.inject(CredentialStore).isConfigured()).toBe(true);
  });

  it('offers Delete key only while a key is saved, and closes asking for it', async () => {
    const { outcome, fixture } = await open(true);

    expect(save().textContent.trim()).toBe('Save key');
    document.querySelector<HTMLButtonElement>('[data-testid="delete-key"]')!.click();
    await settle(fixture);

    await expect(outcome).resolves.toBe('delete');
  });

  it('says a refused key was refused, until a new one is typed', async () => {
    refused = true;
    const { fixture } = await open(true);

    expect(line()).toContain('OpenRouter refused the saved key');

    type(fixture, 's');
    expect(line()).toBeUndefined();
  });
});
