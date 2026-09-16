import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { ModelPickerComponent } from './model-picker.component';

function model(
  modelId: string,
  name: string,
  supportedParameters: readonly string[] = [],
): ModelCapabilities {
  return {
    modelId,
    name,
    contextLength: 32_768,
    maxCompletionTokens: null,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters,
    supportedVoices: [],
    reasoning: null,
  };
}

describe('ModelPickerComponent', () => {
  /**
   * The first model choice is the sharpest edge in setup: the whole OpenRouter
   * catalogue, and no basis for picking from it. The curated few lead, and a
   * model the learner has already starred is theirs rather than a suggestion.
   */
  it('leads with the curated suggestions and never lists one twice', async () => {
    await TestBed.configureTestingModule({ imports: [ModelPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ModelPickerComponent);
    fixture.componentRef.setInput('label', 'text models');
    fixture.componentRef.setInput('models', [
      model('vendor/ordinary', 'Ordinary'),
      model('vendor/second', 'Second', ['response_format']),
      model('vendor/first', 'First', ['structured_outputs']),
      model('vendor/starred', 'Starred', ['structured_outputs']),
    ]);
    fixture.componentRef.setInput('suggestedIds', [
      'vendor/first',
      'vendor/second',
      'vendor/starred',
      'vendor/retired',
    ]);
    fixture.componentRef.setInput('favoriteIds', ['vendor/starred']);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('.trigger')!.click();
    fixture.detectChanges();

    const names = (selector: string) =>
      [...element.querySelectorAll(`${selector} .model-choice strong`)].map(
        (node) => node.textContent,
      );
    expect(names('.suggested')).toEqual(['First', 'Second']);
    expect(names('.favorites')).toEqual(['Starred']);
    expect(names('.results')).toEqual(['Ordinary']);
  });

  /**
   * A fact from the catalogue, stated where it is advertised. Its absence is
   * not evidence of failure, so no row is marked as lacking it.
   */
  it('names advertised structured output on text models only', async () => {
    await TestBed.configureTestingModule({ imports: [ModelPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ModelPickerComponent);
    fixture.componentRef.setInput('label', 'text models');
    fixture.componentRef.setInput('models', [
      model('vendor/shaped', 'Shaped', ['structured_outputs']),
      model('vendor/plain', 'Plain'),
    ]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.trigger')!.click();
    fixture.detectChanges();

    const meta = [...element.querySelectorAll('.results .model-meta')].map(
      (node) => node.textContent,
    );
    expect(meta[0]).toContain('structured output');
    expect(meta[1]).not.toContain('structured output');
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
});
