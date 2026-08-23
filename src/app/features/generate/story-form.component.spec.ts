import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import { MAX_PREMISE_LENGTH } from '../../domain/ai/story-request';
import { StoryFormComponent } from './story-form.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StoryFormComponent],
  template: `<mn-story-form
    [canGenerate]="canGenerate()"
    [disabled]="disabled()"
    snapshotSummary="200 reviewed words"
    presetName="Starter forms"
    (generate)="generated = generated + 1"
  />`,
})
class HostComponent {
  readonly canGenerate = signal(true);
  readonly disabled = signal(false);
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
      `2 / ${String(MAX_PREMISE_LENGTH)}`,
    );
  });

  it('marks an over-long premise as invalid for assistive technology', () => {
    const { element, fixture } = render();

    type(element, 'premise', 'あ'.repeat(MAX_PREMISE_LENGTH + 1));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="premise"]')?.getAttribute('aria-invalid')).toBe(
      'true',
    );
  });

  it('offers a four-stop length slider with a 50-sentence maximum', () => {
    const { element } = render();

    const text = element.querySelector('.story-settings')?.textContent ?? '';
    expect(text).toContain('Tiny');
    expect(text).toContain('Short');
    expect(text).toContain('Medium');
    expect(text).toContain('Long');
    expect(element.querySelector<HTMLInputElement>('[data-testid="story-length"]')?.max).toBe('3');
    expect(text).toContain('15');
  });

  it('snaps to the selected named length and stores its exact sentence count', () => {
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

  it('names unavailable Anki word selection without roadmap copy', () => {
    const { element } = render();

    const select = element.querySelector<HTMLSelectElement>('#mn-word-selection');
    expect(select?.disabled).toBe(true);
    expect(select?.textContent).toContain('Word selection unavailable');
    expect(element.querySelector('.word-selection')?.textContent).toContain('Unavailable');
    expect(element.textContent).not.toContain('coming later');
  });

  it('names the missing text model and sends the learner to Settings', () => {
    const { element } = render();
    const select = element.querySelector<HTMLSelectElement>('[data-testid="story-model-select"]');

    expect(select?.disabled).toBe(true);
    expect(select?.textContent).toContain('No text model configured');
    expect(element.querySelector('a[routerlink="/settings"]')?.textContent).toContain(
      'Open Settings',
    );
  });

  it('keeps special instructions optional', () => {
    const { element } = render();

    expect(element.querySelector('label[for="mn-instructions"]')?.textContent).toContain(
      'optional',
    );
  });

  it('keeps premise and instruction guidance inside the text boxes', () => {
    const { element } = render();

    expect(
      element.querySelector<HTMLTextAreaElement>('[data-testid="premise"]')?.placeholder,
    ).toContain('up to 1,000 characters');
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
