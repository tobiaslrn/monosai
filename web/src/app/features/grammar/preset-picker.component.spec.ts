import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import type { GrammarPresetId } from '../../domain/grammar/presets';
import { startSentence } from '../../domain/shared/locale';
import { configureGrammarTestBed, TEST_PRESETS } from '../../../testing/grammar-fakes';
import { PresetPickerComponent } from './preset-picker.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PresetPickerComponent],
  template: `<mn-preset-picker [selected]="selected()" (selectedChange)="chosen.set($event)" />`,
})
class HostComponent {
  readonly selected = signal<GrammarPresetId | null>('mn-preset-starter');
  readonly chosen = signal<GrammarPresetId | null>(null);
}

describe('PresetPickerComponent', () => {
  let store: GrammarProfileStore;

  beforeEach(() => {
    store = configureGrammarTestBed();
  });

  async function render(): Promise<{
    readonly fixture: ComponentFixture<HostComponent>;
    readonly element: HTMLElement;
  }> {
    await store.load();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  function radios(element: HTMLElement): HTMLInputElement[] {
    return [...element.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  }

  it('exposes the ladder as a labelled radiogroup', async () => {
    const { element } = await render();
    const group = element.querySelector('[role="radiogroup"]');

    expect(group).not.toBeNull();
    expect(group?.getAttribute('aria-label')).toBe('Reading level');
    expect(radios(element)).toHaveLength(TEST_PRESETS.length);
  });

  it('checks the preset it is given and only that one', async () => {
    const { element } = await render();

    expect(radios(element).map((radio) => radio.checked)).toEqual([true, false]);
  });

  it('names and captions every preset without a JLPT level in the name', async () => {
    const { element } = await render();
    const cards = [...element.querySelectorAll('.preset')];

    expect(cards).toHaveLength(TEST_PRESETS.length);
    for (const [index, card] of cards.entries()) {
      const preset = TEST_PRESETS[index];
      expect(card.querySelector('.name')?.textContent.trim()).toBe(preset.nameEn);
      expect(card.querySelector('.name')?.textContent).not.toMatch(/\bN[1-5]\b/);
      expect(card.querySelector('.caption')?.textContent.trim()).toBe(
        startSentence(preset.captionEn),
      );
    }
  });

  /**
   * Learners choose by reading an example, so the chosen card opens its own;
   * the rest stay one short card each so the ladder can be scanned.
   */
  it('opens the example of the chosen preset, in Japanese', async () => {
    const { fixture, element } = await render();
    const examples = (): Element[] => [...element.querySelectorAll('.example')];

    expect(examples()).toHaveLength(1);
    expect(examples()[0].textContent.trim()).toBe(TEST_PRESETS[0].exampleJa);
    expect(examples()[0].getAttribute('lang')).toBe('ja');

    fixture.componentInstance.selected.set('mn-preset-basic');
    fixture.detectChanges();

    expect(examples()).toHaveLength(1);
    expect(examples()[0].textContent.trim()).toBe(TEST_PRESETS[1].exampleJa);
  });

  it('reports a choice without saving it', async () => {
    const { fixture, element } = await render();

    radios(element)[1].click();
    await Promise.resolve();

    expect(fixture.componentInstance.chosen()).toBe('mn-preset-basic');
    expect(store.selection().presetId).toBe('mn-preset-starter');
  });

  it('explains itself rather than rendering an empty group before assets load', async () => {
    TestBed.resetTestingModule();
    store = configureGrammarTestBed([]);
    const { element } = await render();

    expect(radios(element)).toHaveLength(0);
    expect(element.textContent).toContain('Language assets are still loading.');
  });
});
