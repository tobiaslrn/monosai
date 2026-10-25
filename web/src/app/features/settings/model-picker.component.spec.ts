import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installPopoverShim } from '../../../testing/popover-shim';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { ModelPickerComponent } from './model-picker.component';

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

describe('ModelPickerComponent', () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installPopoverShim();
  });

  afterEach(() => {
    uninstall();
  });

  it('keeps favourites above the scrollable searchable catalogue', async () => {
    await TestBed.configureTestingModule({ imports: [ModelPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ModelPickerComponent);
    fixture.componentRef.setInput('label', 'text models');
    fixture.componentRef.setInput('models', [
      model('vendor/ordinary', 'Ordinary'),
      model('vendor/favourite', 'Favourite'),
    ]);
    fixture.componentRef.setInput('favoriteIds', ['vendor/favourite']);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('.trigger')!.click();
    fixture.detectChanges();

    const panel = element.querySelector<HTMLElement>('.panel')!;
    expect(panel.querySelector('.favorites')?.textContent).toContain('Favourite');
    expect(panel.querySelector('.results')?.textContent).toContain('Ordinary');

    const search = panel.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'ordinary';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(panel.querySelector('.favorites')).toBeNull();
    expect(panel.querySelector('.results')?.textContent).toContain('Ordinary');
  });

  it('shows a saved model ID before the catalogue has loaded', async () => {
    await TestBed.configureTestingModule({ imports: [ModelPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ModelPickerComponent);
    fixture.componentRef.setInput('label', 'text models');
    fixture.componentRef.setInput('selectedId', 'vendor/saved-model');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.trigger')?.textContent).toContain('vendor/saved-model');
  });

  it('offers a fallback choice inside the same searchable dropdown', async () => {
    await TestBed.configureTestingModule({ imports: [ModelPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ModelPickerComponent);
    fixture.componentRef.setInput('label', 'translation models');
    fixture.componentRef.setInput('fallbackLabel', 'Same as Story');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.trigger')?.textContent).toContain('Same as Story');
    element.querySelector<HTMLButtonElement>('.trigger')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.fallback')?.textContent).toContain('Same as Story');
  });

  describe('its panel', () => {
    async function render() {
      await TestBed.configureTestingModule({ imports: [ModelPickerComponent] }).compileComponents();
      const fixture = TestBed.createComponent(ModelPickerComponent);
      fixture.componentRef.setInput('label', 'text models');
      fixture.componentRef.setInput('models', [model('vendor/one', 'One')]);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const trigger = element.querySelector<HTMLButtonElement>('.trigger')!;
      const panel = element.querySelector<HTMLElement>('.panel')!;
      return { fixture, trigger, panel, element };
    }

    it('is a native popover the trigger names, closed until it is opened', async () => {
      const { fixture, trigger, panel, element } = await render();

      expect(panel.getAttribute('popover')).toBe('auto');
      expect(trigger.getAttribute('popovertarget')).toBe(panel.id);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(element.querySelector('input[type="search"]')).toBeNull();

      trigger.click();
      fixture.detectChanges();

      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(element.querySelector('input[type="search"]')).not.toBeNull();
    });

    it('announces that it opened, so the catalogue can be fetched', async () => {
      const { fixture, trigger } = await render();
      let opened = 0;
      fixture.componentInstance.opened.subscribe(() => {
        opened += 1;
      });

      trigger.click();
      fixture.detectChanges();

      expect(opened).toBe(1);
    });

    it('closes on a press outside and on Escape, and hands focus back to the trigger', async () => {
      const { fixture, trigger, element } = await render();
      trigger.focus();
      trigger.click();
      fixture.detectChanges();

      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      fixture.detectChanges();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(element.querySelector('input[type="search"]')).toBeNull();

      trigger.click();
      fixture.detectChanges();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      element.querySelector<HTMLElement>('input[type="search"]')!.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
    });

    it('stays open for a press inside it, and closes after a model is chosen', async () => {
      const { fixture, trigger, element } = await render();
      const chosen: string[] = [];
      fixture.componentInstance.modelSelected.subscribe((picked) => {
        chosen.push(picked.modelId);
      });
      trigger.click();
      fixture.detectChanges();

      element
        .querySelector<HTMLElement>('input[type="search"]')!
        .dispatchEvent(new Event('pointerdown', { bubbles: true }));
      fixture.detectChanges();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');

      element.querySelector<HTMLButtonElement>('.model-choice')!.click();
      fixture.detectChanges();

      expect(chosen).toEqual(['vendor/one']);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('forgets the search when it closes', async () => {
      const { fixture, trigger, element } = await render();
      trigger.click();
      fixture.detectChanges();
      const search = element.querySelector<HTMLInputElement>('input[type="search"]')!;
      search.value = 'one';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      trigger.click();
      fixture.detectChanges();

      expect(element.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('');
    });
  });
});
