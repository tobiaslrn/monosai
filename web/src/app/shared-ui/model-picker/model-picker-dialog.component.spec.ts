import { Dialog } from '@angular/cdk/dialog';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import {
  openModelPicker,
  type ModelPickerChoice,
  type ModelPickerRequest,
} from './model-picker-dialog.component';

@Component({ template: `<button type="button" id="opener">Model</button>` })
class HostComponent {}

function model(modelId: string, name: string): ModelCapabilities {
  return {
    modelId,
    name,
    contextLength: 32_768,
    maxCompletionTokens: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: [],
    supportedVoices: [],
    reasoning: null,
  };
}

/**
 * The searchable picker, opened the way a settings row opens it: a task dialog
 * with the search pinned, Favourites above All models, the chosen option
 * checked, and a choice that closes it with that choice.
 */
describe('openModelPicker', () => {
  let opener: HTMLButtonElement;
  let favorites: ReturnType<typeof signal<readonly string[]>>;
  let toggled: string[];

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [HostComponent] });
    favorites = signal<readonly string[]>([]);
    toggled = [];
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
  });

  function request(overrides: Partial<ModelPickerRequest> = {}): ModelPickerRequest {
    return {
      title: 'Text model',
      models: () => [model('vendor/ordinary', 'Ordinary'), model('vendor/favourite', 'Favourite')],
      favoriteIds: favorites,
      selectedId: () => '',
      loading: () => false,
      failure: () => null,
      toggleFavorite: (id) => {
        toggled.push(id);
      },
      ...overrides,
    };
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

  async function open(asked: ModelPickerRequest = request()): Promise<{
    readonly choice: Promise<ModelPickerChoice | undefined>;
    readonly fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  }> {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    opener = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('#opener')!;
    document.body.append(opener);
    opener.focus();
    const choice = openModelPicker(TestBed.inject(Dialog), asked);
    await settle(fixture);
    return { choice, fixture };
  }

  const dialog = (): HTMLElement => document.querySelector<HTMLElement>('mn-model-picker-dialog')!;
  const search = (): HTMLInputElement =>
    dialog().querySelector<HTMLInputElement>('input[type="search"]')!;

  function type(fixture: { detectChanges: () => void }, text: string): void {
    search().value = text;
    search().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('is a task dialog titled by what is chosen, with the search pinned', async () => {
    await open();

    expect(dialog().querySelector('h2')?.textContent).toBe('Text model');
    expect(dialog().querySelector('.mn-overlay--picker')).not.toBeNull();
    expect(dialog().querySelector('.mn-overlay__pinned input[type="search"]')).toBe(search());
  });

  it('keeps favourites as a group above the searchable rest', async () => {
    favorites.set(['vendor/favourite']);
    const { fixture } = await open();

    expect(dialog().querySelector('.favorites')?.textContent).toContain('Favourite');
    expect(dialog().querySelector('.results')?.textContent).toContain('All models');
    expect(dialog().querySelector('.results')?.textContent).toContain('Ordinary');

    type(fixture, 'ordinary');
    expect(dialog().querySelector('.favorites')).toBeNull();
    expect(dialog().querySelector('.results')?.textContent).toContain('Ordinary');
  });

  it('does not say nothing matches while a favourite matches', async () => {
    favorites.set(['vendor/favourite']);
    const { fixture } = await open(request({ models: () => [model('vendor/favourite', 'Fav')] }));

    expect(dialog().querySelector('.state')).toBeNull();

    type(fixture, 'zzz');
    expect(dialog().querySelector('.state')?.textContent).toContain('No matching models');
  });

  it('marks the chosen model with a check and shows each id on its own line', async () => {
    await open(request({ selectedId: () => 'vendor/ordinary' }));

    const chosen = dialog().querySelector('[aria-current="true"]')!;
    expect(chosen.textContent).toContain('Ordinary');
    expect(chosen.closest('.mn-dropdown-row')?.querySelector('.mn-dropdown-row__check')).not.toBe(
      null,
    );
    expect(chosen.querySelector('.mn-code')?.textContent).toBe('vendor/ordinary');
  });

  it('closes with the model that was chosen', async () => {
    const { choice, fixture } = await open();

    dialog()
      .querySelector<HTMLButtonElement>('[data-testid="model-option-vendor/ordinary"]')!
      .click();
    await settle(fixture);

    const picked = await choice;
    expect(picked?.kind).toBe('model');
    expect(picked?.kind === 'model' ? picked.model.modelId : '').toBe('vendor/ordinary');
  });

  it('offers the fallback first, and closes with it', async () => {
    const { choice, fixture } = await open(request({ fallbackLabel: 'Use the text model' }));

    const first = dialog().querySelector('[data-testid="model-picker-fallback"]')!;
    expect(first.textContent).toContain('Use the text model');
    expect(first.getAttribute('aria-current')).toBe('true');

    dialog().querySelector<HTMLButtonElement>('[data-testid="model-picker-fallback"]')!.click();
    await settle(fixture);

    await expect(choice).resolves.toEqual({ kind: 'fallback' });
  });

  it('toggles a favourite without closing', async () => {
    const { fixture } = await open();

    dialog().querySelector<HTMLButtonElement>('[aria-label="Add to favourites"]')!.click();
    await settle(fixture);

    expect(toggled).toEqual(['vendor/ordinary']);
    expect(dialog()).not.toBeNull();
  });

  it('says it is loading, and what failed', async () => {
    const loading = signal(true);
    const failure = signal<string | null>(null);
    const { fixture } = await open(request({ loading, failure, models: () => [] }));
    expect(dialog().querySelector('[role="status"]')?.textContent).toContain('Loading');

    loading.set(false);
    failure.set('Too many requests.');
    await settle(fixture);
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('Too many requests.');
  });

  it('closes without a choice on Escape and hands focus back', async () => {
    const { choice, fixture } = await open();

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    Object.defineProperty(event, 'keyCode', { get: () => 27 });
    document.querySelector('[role="dialog"]')!.dispatchEvent(event);
    await settle(fixture);

    await expect(choice).resolves.toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });
});
