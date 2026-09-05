import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import { MAX_PREMISE_LENGTH } from '../../domain/ai/story-request';
import type { AnkiWordPriorityMode, VocabularyStrictness } from '../../domain/settings/settings';
import { StoryFormComponent } from './story-form.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StoryFormComponent],
  template: `<mn-story-form
    [canGenerate]="canGenerate()"
    [disabled]="disabled()"
    snapshotSummary="200 reviewed words"
    presetName="Starter forms"
    [ankiWordPriorityMode]="priorityMode()"
    (ankiWordPriorityModeChanged)="priorityMode.set($event)"
    [vocabularyStrictness]="strictness()"
    (vocabularyStrictnessChanged)="strictness.set($event)"
    (generate)="generated = generated + 1"
  />`,
})
class HostComponent {
  readonly canGenerate = signal(true);
  readonly disabled = signal(false);
  readonly priorityMode = signal<AnkiWordPriorityMode>('uniform');
  readonly strictness = signal<VocabularyStrictness>('standard');
  generated = 0;
}

describe('StoryFormComponent', () => {
  let draft: GenerationDraftStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    draft = TestBed.inject(GenerationDraftStore);
    draft.clear();
  });

  interface Rendered {
    readonly element: HTMLElement;
    readonly fixture: ComponentFixture<HostComponent>;
    readonly host: HostComponent;
  }

  function render(): Rendered {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return {
      element: fixture.nativeElement as HTMLElement,
      fixture,
      host: fixture.componentInstance,
    };
  }

  function type(element: HTMLElement, testId: string, value: string): void {
    const field = element.querySelector<HTMLTextAreaElement>(`[data-testid="${testId}"]`);
    if (field === null) {
      throw new Error(`no field named ${testId}`);
    }
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  it('clears story fields while keeping defaults and one primary action', () => {
    const { element, fixture, host } = render();
    draft.setPremise('ねこ');
    draft.setSpecialInstructions('Dialogue');
    draft.setSentenceCount(50);
    host.priorityMode.set('recent');
    host.strictness.set('strict');
    draft.clear();
    fixture.detectChanges();
    expect(draft.premise()).toBe('');
    expect(draft.specialInstructions()).toBe('');
    expect(draft.sentenceCount()).toBe(15);
    expect(host.priorityMode()).toBe('recent');
    expect(host.strictness()).toBe('strict');
    expect(element.querySelector('.text-fields')?.textContent).toContain('This story');
    expect(element.querySelector('.story-settings')?.textContent).toContain(
      'Defaults for every story',
    );
    expect(element.querySelectorAll('.mn-button--primary')).toHaveLength(1);
  });

  it('writes the premise into the shared draft, so it survives a trip to Settings', () => {
    const { element } = render();

    type(element, 'premise', 'ねこが旅に出る話。');

    expect(draft.premise()).toBe('ねこが旅に出る話。');
  });

  it('counts characters against the stated limit', () => {
    const { element, fixture } = render();

    type(element, 'premise', 'ねこ');
    fixture.detectChanges();

    expect(element.querySelector('#mn-premise-count')?.textContent).toContain(
      '2 of 1,000 characters',
    );
  });

  it('marks an over-long premise as invalid for assistive technology', () => {
    const { element, fixture } = render();

    type(element, 'premise', 'あ'.repeat(MAX_PREMISE_LENGTH + 1));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="premise"]')?.getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(element.querySelector('#mn-premise-limit')?.getAttribute('role')).toBe('alert');
    expect(element.querySelector('#mn-premise-limit')?.textContent).toContain(
      'Remove 1 character to continue.',
    );
    expect(
      element.querySelector('[data-testid="premise"]')?.getAttribute('aria-describedby'),
    ).toContain('mn-premise-limit');
  });

  it('uses the same counter wording and alignment for both story fields', () => {
    const { element } = render();

    expect(element.querySelector('#mn-premise-count')?.textContent).toContain(
      '0 of 1,000 characters',
    );
    expect(element.querySelector('#mn-instructions-count')?.textContent).toContain(
      '0 of 1,000 characters',
    );
    expect(element.querySelectorAll('.counter')).toHaveLength(2);
  });

  it('offers more length stops up to 800 sentences without adding length names', () => {
    const { element } = render();

    const text = element.querySelector('.text-fields')?.textContent ?? '';
    expect(text).toContain('Tiny');
    expect(text).toContain('Short');
    expect(text).toContain('Medium');
    expect(text).toContain('Long');
    expect(element.querySelectorAll('.length-scale span')).toHaveLength(4);
    expect(element.querySelector<HTMLInputElement>('[data-testid="story-length"]')?.max).toBe('7');
    expect(text).toContain('15');
    expect(element.querySelector('#mn-length-help')).toBeNull();
  });

  it('snaps to the selected named length and stores its sentence target', () => {
    const { element, fixture } = render();

    const slider = element.querySelector<HTMLInputElement>('[data-testid="story-length"]');
    if (slider === null) {
      throw new Error('story length slider was not rendered');
    }
    slider.value = '3';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(draft.sentenceCount()).toBe(50);
    expect(element.querySelector('output')?.textContent).toContain('50');
    expect(slider.getAttribute('aria-valuetext')).toBe('Long, 50 sentences');
  });

  it('allows very long stories while warning that models follow constraints less reliably', () => {
    const { element, fixture } = render();
    const slider = element.querySelector<HTMLInputElement>('[data-testid="story-length"]');
    if (slider === null) {
      throw new Error('story length slider was not rendered');
    }

    expect(element.querySelector('#mn-length-warning')).toBeNull();
    slider.value = '7';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(draft.sentenceCount()).toBe(800);
    expect(slider.getAttribute('aria-valuetext')).toBe('Long, 800 sentences');
    expect(slider.getAttribute('aria-describedby')).toContain('mn-length-warning');
    expect(element.querySelector('#mn-length-warning')?.textContent).toContain(
      'less reliable at following your grammar and vocabulary settings',
    );
    expect(element.querySelector<HTMLButtonElement>('[data-testid="generate"]')?.disabled).toBe(
      false,
    );
  });

  it('offers the remembered Anki word-priority modes', () => {
    const { element } = render();

    const select = element.querySelector<HTMLSelectElement>('#mn-word-selection');
    expect(select?.disabled).toBe(false);
    expect(select?.value).toBe('uniform');
    expect(select?.textContent).toContain('Recently learned');
    expect(select?.textContent).toContain('Difficult');
    expect(element.querySelector('.word-selection')?.textContent).not.toContain('Inspiration only');
    expect(select?.getAttribute('aria-describedby')).toBe('mn-priority-scope');
  });

  it('emits a changed mode and locks the select during generation', () => {
    const { element, fixture, host } = render();
    const select = element.querySelector<HTMLSelectElement>('#mn-word-selection');
    if (select === null) {
      throw new Error('word-priority select was not rendered');
    }

    select.value = 'recent';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.priorityMode()).toBe('recent');

    host.disabled.set(true);
    fixture.detectChanges();
    expect(select.disabled).toBe(true);
  });

  it('keeps vocabulary strictness in an advanced disclosure and emits changes', () => {
    const { element, fixture, host } = render();
    const details = element.querySelector<HTMLDetailsElement>('.strictness');

    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toContain('Vocabulary strictness');
    const relaxed = details?.querySelector<HTMLInputElement>('input[value="relaxed"]');
    if (relaxed === null || relaxed === undefined) {
      throw new Error('relaxed strictness choice was not rendered');
    }
    relaxed.click();
    fixture.detectChanges();

    expect(host.strictness()).toBe('relaxed');
    expect(details?.textContent).toContain('Keep the first draft');
  });

  it('leaves model choice to Settings', () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="story-model-select"]')).toBeNull();
  });

  it('keeps special instructions optional', () => {
    const { element } = render();

    expect(element.querySelector('label[for="mn-instructions"]')?.textContent).toContain(
      'optional',
    );
  });

  it('leaves the draft valid with no premise, which asks for a random topic', () => {
    const { element } = render();

    expect(draft.isValid()).toBe(true);
    expect(
      element.querySelector<HTMLLabelElement>('label[for="mn-premise"]')?.textContent,
    ).toContain('optional');

    type(element, 'premise', 'ねこ');
    expect(draft.isValid()).toBe(true);
  });

  it('keeps premise and instruction guidance inside the text boxes', () => {
    const { element } = render();

    expect(
      element.querySelector<HTMLTextAreaElement>('[data-testid="premise"]')?.placeholder,
    ).toContain('leave it empty');
    expect(
      element.querySelector<HTMLTextAreaElement>('[data-testid="special-instructions"]')
        ?.placeholder,
    ).toContain('optional');
  });

  it('links the snapshot and preset from the settings sidebar', () => {
    const { element } = render();

    const sources = element.querySelector('[data-testid="form-sources"]');
    expect(sources?.textContent).toContain('200 reviewed words');
    expect(sources?.textContent).toContain('Starter forms');
    expect(sources?.querySelectorAll('a')).toHaveLength(2);
    // Generate acts on the whole composer, so it is the action bar's rather
    // than the defaults card's.
    expect(element.querySelector('.story-settings [data-testid="generate"]')).toBeNull();
    expect(element.querySelector('.actions [data-testid="generate"]')).not.toBeNull();
  });

  /**
   * What the story is written from is said once, immediately above the button
   * that acts on it, rather than three times across the screen. No price is
   * estimated: a number that is wrong is worse than no number.
   */
  it('presents its linked sources once and estimates no price', () => {
    const { element } = render();

    const sources = element.querySelector('[data-testid="form-sources"]');
    expect(sources?.textContent).toContain('Uses');
    expect(sources?.textContent).toContain('Vocabulary');
    expect(sources?.textContent).toContain('Grammar');
    expect(element.querySelector('[data-testid="generate"]')).not.toBeNull();
    expect(element.querySelectorAll('[data-testid="form-sources"]')).toHaveLength(1);
    expect(element.textContent.toLowerCase()).not.toContain('$');
    expect(element.textContent.toLowerCase()).not.toContain('cost');
  });

  it('shows no genre picker, topic suggestions, or target vocabulary', () => {
    const { element } = render();

    const text = element.textContent.toLowerCase();
    expect(text).not.toContain('genre');
    expect(text).not.toContain('temperature');
    expect(text).not.toContain('target words');
  });

  it('disables Generate until every prerequisite is met', () => {
    const { element, fixture, host } = render();
    host.canGenerate.set(false);
    fixture.detectChanges();

    const button = element.querySelector<HTMLButtonElement>('[data-testid="generate"]');
    expect(button?.disabled).toBe(true);
  });

  it('reports the request to its owner rather than starting one itself', () => {
    const { element, host } = render();

    element.querySelector<HTMLButtonElement>('[data-testid="generate"]')?.click();

    expect(host.generated).toBe(1);
  });

  it('locks the fields while a run is in flight', () => {
    const { element, fixture, host } = render();
    host.disabled.set(true);
    fixture.detectChanges();

    expect(element.querySelector<HTMLTextAreaElement>('[data-testid="premise"]')?.disabled).toBe(
      true,
    );
    expect(element.querySelector<HTMLInputElement>('[data-testid="story-length"]')?.disabled).toBe(
      true,
    );
    expect(element.querySelector<HTMLButtonElement>('[data-testid="generate"]')?.disabled).toBe(
      true,
    );
  });
});
