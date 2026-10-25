import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import { StoryPlotStore } from '../../application/generation/story-plot.store';
import { RANDOM_SOURCE } from '../../application/shared/repository-tokens';
import type { PlotCard } from '../../domain/ai/story-plot';
import { EMPTY_STORY_DIRECTION, rollPlotFrames } from '../../domain/ai/story-direction';
import { MAX_SPECIAL_INSTRUCTIONS_LENGTH } from '../../domain/ai/story-request';
import type {
  AnkiWordPriorityMode,
  RecentFocusSize,
  VocabularyStrictness,
} from '../../domain/settings/settings';
import { StoryFormComponent } from './story-form.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StoryFormComponent],
  template: `<mn-story-form
    [canContinue]="canContinue()"
    [canGenerate]="canGenerate()"
    [disabled]="disabled()"
    snapshotSummary="200 reviewed words"
    presetName="Starter forms"
    [ankiWordPriorityMode]="priorityMode()"
    (ankiWordPriorityModeChanged)="priorityMode.set($event)"
    [recentFocusSize]="focusSize()"
    (recentFocusSizeChanged)="focusSize.set($event)"
    [vocabularyStrictness]="strictness()"
    (vocabularyStrictnessChanged)="strictness.set($event)"
    (next)="nexts = nexts + 1"
    (generate)="generated = generated + 1"
  />`,
})
class HostComponent {
  readonly canContinue = signal(true);
  readonly canGenerate = signal(true);
  readonly disabled = signal(false);
  readonly priorityMode = signal<AnkiWordPriorityMode>('uniform');
  readonly focusSize = signal<RecentFocusSize>(50);
  readonly strictness = signal<VocabularyStrictness>('standard');
  nexts = 0;
  generated = 0;
}

/** Plots already on offer, so the Plot step renders without a provider. */
function plotStoreStub() {
  const cards = signal<readonly PlotCard[]>(
    rollPlotFrames(EMPTY_STORY_DIRECTION, { nextInt: () => 0 }).map((frame, index) => ({
      id: `plot-${String(index + 1)}`,
      frame,
      text: `Plot ${String(index + 1)}.`,
      draftedText: `Plot ${String(index + 1)}.`,
    })),
  );
  return {
    cards,
    selectedIndex: signal(0),
    failure: signal(null),
    isDrafting: signal(false),
    draftingCount: signal(0),
    canRegenerate: computed(() => true),
    select: () => undefined,
    edit: () => undefined,
    regenerate: () => Promise.resolve(),
  };
}

describe('StoryFormComponent', () => {
  let draft: GenerationDraftStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RANDOM_SOURCE, useValue: { nextInt: () => 0 } },
        { provide: StoryPlotStore, useValue: plotStoreStub() },
      ],
    });
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

  function atStep(fixture: ComponentFixture<HostComponent>, step: 1 | 2 | 3): void {
    draft.setStep(step);
    fixture.detectChanges();
  }

  it('shows three named steps and marks the current one without making them controls', () => {
    const { element, fixture } = render();

    const steps = [...element.querySelectorAll('[data-testid="wizard-steps"] li')];
    expect(steps.map((step) => step.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      '1 Words',
      '2 Direction',
      '3 Plot',
    ]);
    expect(steps[0].getAttribute('aria-current')).toBe('step');
    expect(
      element.querySelector('[data-testid="wizard-steps"] button, [data-testid="wizard-steps"] a'),
    ).toBeNull();

    atStep(fixture, 3);
    expect(element.querySelector('[aria-current="step"]')?.textContent).toContain('Plot');
    expect(element.querySelector('[data-testid="wizard-steps"] li')?.textContent).toContain('done');
  });

  it('has exactly one filled action on every step: Next, then Generate story', () => {
    const { element, fixture } = render();

    for (const step of [1, 2, 3] as const) {
      atStep(fixture, step);
      const primaries = element.querySelectorAll('.mn-button--primary');
      expect(primaries).toHaveLength(1);
      expect(primaries[0].textContent.trim()).toBe(step === 3 ? 'Generate story' : 'Next');
    }
  });

  it('reports Next and Generate to its owner rather than acting itself', () => {
    const { element, fixture, host } = render();

    element.querySelector<HTMLButtonElement>('[data-testid="wizard-next"]')?.click();
    expect(host.nexts).toBe(1);
    expect(draft.step()).toBe(1);

    atStep(fixture, 3);
    element.querySelector<HTMLButtonElement>('[data-testid="generate"]')?.click();
    expect(host.generated).toBe(1);
  });

  it('disables Next and Generate when their owner says they cannot go on', () => {
    const { element, fixture, host } = render();
    host.canContinue.set(false);
    host.canGenerate.set(false);
    fixture.detectChanges();
    expect(element.querySelector<HTMLButtonElement>('[data-testid="wizard-next"]')?.disabled).toBe(
      true,
    );

    atStep(fixture, 3);
    expect(element.querySelector<HTMLButtonElement>('[data-testid="generate"]')?.disabled).toBe(
      true,
    );
  });

  it('keeps the word controls, the length, and the sources on the Words step only', () => {
    const { element, fixture } = render();

    expect(element.querySelector('#mn-word-selection')).not.toBeNull();
    expect(element.querySelector('[data-testid="story-length"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="form-sources"]')?.textContent).toContain(
      '200 reviewed words',
    );
    expect(element.querySelector('[data-testid="form-sources"]')?.textContent).toContain(
      'Starter forms',
    );
    // No focus-word list: showing a target list would turn reading into a checklist.
    expect(element.textContent.toLowerCase()).not.toContain('target words');
    expect(element.textContent.toLowerCase()).not.toContain('cost');

    atStep(fixture, 2);
    expect(element.querySelector('#mn-word-selection')).toBeNull();
    expect(element.querySelector('[data-testid="form-sources"]')).toBeNull();
  });

  it('snaps to the selected named length and stores its sentence target', () => {
    const { element, fixture } = render();

    const slider = element.querySelector<HTMLInputElement>('[data-testid="story-length"]');
    if (slider === null) {
      throw new Error('story length slider was not rendered');
    }
    expect(element.querySelector('output[for="mn-story-length"]')?.textContent).toContain(
      'Short · about 15 sentences',
    );
    expect(slider.max).toBe('7');
    slider.value = '3';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(draft.sentenceCount()).toBe(50);
    expect(slider.getAttribute('aria-valuetext')).toBe('Long, 50 sentences');
  });

  it('warns about very long stories without blocking them', () => {
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
    expect(slider.getAttribute('aria-describedby')).toContain('mn-length-warning');
    expect(element.querySelector('#mn-length-warning')?.textContent).toContain(
      'Longer stories may ignore your vocabulary and grammar settings',
    );
  });

  it('emits a changed mode and locks the select during generation', () => {
    const { element, fixture, host } = render();
    const select = element.querySelector<HTMLSelectElement>('#mn-word-selection');
    if (select === null) {
      throw new Error('word-priority select was not rendered');
    }
    expect(select.value).toBe('uniform');

    select.value = 'recent';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.priorityMode()).toBe('recent');

    host.disabled.set(true);
    fixture.detectChanges();
    expect(select.disabled).toBe(true);
  });

  it('offers the focus size only while Recently learned is selected', () => {
    const { element, fixture, host } = render();
    expect(element.querySelector('#mn-focus-size')).toBeNull();

    host.priorityMode.set('recent');
    fixture.detectChanges();
    const select = element.querySelector<HTMLSelectElement>('#mn-focus-size');
    expect(select?.value).toBe('50');
    expect([...(select?.options ?? [])].map((option) => option.textContent.trim())).toEqual([
      'Newest 25 words',
      'Newest 50 words',
      'Newest 100 words',
    ]);

    select!.value = '25';
    select!.dispatchEvent(new Event('change'));
    expect(host.focusSize()).toBe(25);

    host.priorityMode.set('difficult');
    fixture.detectChanges();
    expect(element.querySelector('#mn-focus-size')).toBeNull();
  });

  it('states the strictness in its closed disclosure and emits changes', () => {
    const { element, fixture, host } = render();
    const details = element.querySelector<HTMLDetailsElement>('.strictness');

    expect(details?.open).toBe(false);
    expect(details?.querySelector('[data-testid="strictness-value"]')?.textContent).toContain(
      'Standard',
    );
    details?.querySelector<HTMLInputElement>('input[value="relaxed"]')?.click();
    fixture.detectChanges();

    expect(host.strictness()).toBe('relaxed');
    expect(details?.querySelector('[data-testid="strictness-value"]')?.textContent).toContain(
      'Relaxed',
    );
  });

  it('shows what every strictness means inside its own card', () => {
    const { element } = render();
    const cards = [...element.querySelectorAll('.strictness mn-radio-card')];

    expect(
      cards.map((card) => [
        card.querySelector('.strictness-name')?.textContent,
        card.querySelector('.strictness-description')?.textContent,
      ]),
    ).toEqual([
      ['Relaxed', 'Keep the first draft.'],
      ['Standard', 'Try once to replace unfamiliar words.'],
      ['Strict', 'Try twice to replace unfamiliar words.'],
    ]);
  });

  it('locks the strictness choice while a run is in flight', () => {
    const { element, fixture, host } = render();
    host.disabled.set(true);
    fixture.detectChanges();

    const radios = element.querySelectorAll<HTMLInputElement>('.strictness input[type="radio"]');
    expect(radios).toHaveLength(3);
    expect([...radios].every((radio) => radio.disabled)).toBe(true);
  });

  it('opens Genre first, states every axis value, and keeps one row open at a time', () => {
    const { element, fixture } = render();
    atStep(fixture, 2);

    const rows = [...element.querySelectorAll<HTMLDetailsElement>('details.axis')];
    expect(rows.map((row) => row.dataset['axis'])).toEqual([
      'genre',
      'topic',
      'setting',
      'mood',
      'cast',
      'format',
    ]);
    expect(rows.filter((row) => row.open).map((row) => row.dataset['axis'])).toEqual(['genre']);
    expect(rows.every((row) => row.getAttribute('name') === 'mn-story-axis')).toBe(true);
    expect(
      rows.map((row) => row.querySelector('[data-testid="axis-value"]')?.textContent.trim()),
    ).toEqual(['Any', 'Any', 'Any', 'Any', 'Any', 'Any']);
  });

  it('keeps chips in place, leads with Any, ends with Custom, and marks choices pressed', () => {
    const { element, fixture } = render();
    atStep(fixture, 2);
    const genre = (): HTMLButtonElement[] => [
      ...element.querySelectorAll<HTMLButtonElement>('[data-axis="genre"] .chips button'),
    ];
    const before = genre().map((chip) => chip.textContent.trim());
    expect(before[0]).toBe('Any');
    expect(before.at(-1)).toBe('Custom');
    expect(genre()[0].getAttribute('aria-pressed')).toBe('true');

    genre()
      .find((chip) => chip.textContent.trim() === 'Mystery')
      ?.click();
    genre()
      .find((chip) => chip.textContent.trim() === 'Comedy')
      ?.click();
    fixture.detectChanges();

    expect(genre().map((chip) => chip.textContent.trim())).toEqual(before);
    expect(
      genre()
        .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
        .map((chip) => chip.textContent.trim()),
    ).toEqual(['Comedy', 'Mystery']);
    expect(
      element.querySelector('[data-axis="genre"] [data-testid="axis-value"]')?.textContent.trim(),
    ).toBe('Mystery, Comedy');
    // Selected is the soft tint a pressed toggle wears, not the filled primary.
    expect(element.querySelectorAll('.axes .mn-button--primary')).toHaveLength(0);

    genre()[0].click();
    fixture.detectChanges();
    expect(draft.direction().selected.genre).toEqual([]);
  });

  it('adds a custom option as a picked chip that stays in its row', () => {
    const { element, fixture } = render();
    atStep(fixture, 2);
    element.querySelector<HTMLButtonElement>('[data-axis="genre"] [data-custom-toggle]')?.click();
    fixture.detectChanges();

    const field = element.querySelector<HTMLInputElement>('[data-testid="custom-option"]');
    expect(field?.maxLength).toBe(40);
    field!.value = 'Baking contest';
    field!.form?.requestSubmit();
    fixture.detectChanges();

    const chips = [...element.querySelectorAll('[data-axis="genre"] .chips button')].map((chip) =>
      chip.textContent.trim(),
    );
    expect(chips.slice(-2)).toEqual(['Baking contest', 'Custom']);
    expect(draft.direction().selected.genre).toEqual(['Baking contest']);
    expect(element.querySelector('[data-testid="custom-option"]')).toBeNull();
  });

  it('fills every axis from Surprise me and says so in each row', () => {
    const { element, fixture } = render();
    atStep(fixture, 2);
    element.querySelector<HTMLButtonElement>('[data-testid="surprise-direction"]')?.click();
    fixture.detectChanges();

    const values = [...element.querySelectorAll('[data-testid="axis-value"]')].map((value) =>
      value.textContent.trim(),
    );
    expect(values).toHaveLength(6);
    expect(values).not.toContain('Any');
  });

  it('keeps special instructions optional, counted, and limited', () => {
    const { element, fixture } = render();
    atStep(fixture, 2);
    expect(element.querySelector('label[for="mn-instructions"]')?.textContent).toContain(
      'optional',
    );
    expect(element.querySelector('#mn-instructions-count')).toBeNull();
    // No premise box any more: the plot step produces the premise.
    expect(element.querySelector('[data-testid="premise"]')).toBeNull();

    type(element, 'special-instructions', 'い'.repeat(MAX_SPECIAL_INSTRUCTIONS_LENGTH + 1));
    fixture.detectChanges();

    expect(element.querySelector('#mn-instructions-count')?.textContent).toContain(
      '1,001 of 1,000 characters',
    );
    expect(element.querySelector('#mn-instructions-limit')?.textContent).toContain(
      'Remove 1 character to continue.',
    );
    expect(draft.isValid()).toBe(false);
  });

  it('shows the plots with where each value came from, and the turning point', () => {
    const { element, fixture } = render();
    atStep(fixture, 3);

    const options = element.querySelectorAll('[data-testid="plot-option"]');
    expect(options).toHaveLength(3);
    const first = options[0];
    expect(first.querySelectorAll('.mn-status-pill--dashed').length).toBe(4);
    expect(first.querySelector('.mn-status-pill--accent')?.textContent).toContain('Turning point');
    expect(first.textContent).toContain('(random)');
    expect(first.querySelector('[data-testid="edit-plot"]')).not.toBeNull();
    expect(options[1].querySelector('[data-testid="edit-plot"]')).toBeNull();
  });

  it('locks the fields while a run is in flight', () => {
    const { element, fixture, host } = render();
    host.disabled.set(true);
    fixture.detectChanges();

    expect(element.querySelector<HTMLInputElement>('[data-testid="story-length"]')?.disabled).toBe(
      true,
    );
    expect(element.querySelector<HTMLButtonElement>('[data-testid="wizard-next"]')?.disabled).toBe(
      true,
    );
  });
});
