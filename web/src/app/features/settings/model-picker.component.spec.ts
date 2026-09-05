import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { ModelPickerComponent } from './model-picker.component';

function model(modelId: string, name: string): ModelCapabilities {
  return {
    modelId,
    name,
    contextLength: 32_768,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: [],
    supportedVoices: [],
    reasoning: null,
  };
}

describe('ModelPickerComponent', () => {
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
