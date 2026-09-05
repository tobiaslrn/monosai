import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { configureGrammarTestBed, TEST_PRESETS } from '../../../testing/grammar-fakes';
import { PresetPickerComponent } from './preset-picker.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PresetPickerComponent],
  template: `<mn-preset-picker />`,
})
class HostComponent {}

describe('PresetPickerComponent', () => {
  let store: GrammarProfileStore;

  beforeEach(() => {
    store = configureGrammarTestBed();
  });

  async function render(): Promise<HTMLElement> {
    await store.load();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function radios(element: HTMLElement): HTMLInputElement[] {
    return [...element.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  }

  it('exposes the ladder as a labelled radiogroup', async () => {
    const element = await render();
    const group = element.querySelector('[role="radiogroup"]');

    expect(group).not.toBeNull();
    expect(group?.getAttribute('aria-label')).toBe('Reading level');
    expect(radios(element)).toHaveLength(TEST_PRESETS.length);
  });

  it('checks the stored preset and only that one', async () => {
    const element = await render();

    expect(radios(element).map((radio) => radio.checked)).toEqual([true, false]);
  });

  it('shows each preset name, caption, and example without a JLPT level in the name', async () => {
    const element = await render();
    const cards = [...element.querySelectorAll('.preset')];

    expect(cards).toHaveLength(TEST_PRESETS.length);
    for (const [index, card] of cards.entries()) {
      const preset = TEST_PRESETS[index];
      expect(card.querySelector('.name')?.textContent.trim()).toBe(preset.nameEn);
      expect(card.querySelector('.name')?.textContent).not.toMatch(/\bN[1-5]\b/);
      expect(card.querySelector('.caption')?.textContent.trim()).toBe(preset.captionEn);
      expect(card.querySelector('.example')?.textContent.trim()).toBe(preset.exampleJa);
    }
  });

  it('marks every Japanese example as Japanese for assistive technology', async () => {
    const element = await render();

    for (const example of element.querySelectorAll('.example')) {
      expect(example.getAttribute('lang')).toBe('ja');
    }
  });

  it('round-trips a selection through the store', async () => {
    const element = await render();

    radios(element)[1].click();
    await Promise.resolve();

    expect(store.selection().presetId).toBe('mn-preset-basic');
    expect(store.resolvedGuidance()).toBe(TEST_PRESETS[1].promptGuidance);
  });

  it('explains itself rather than rendering an empty group before assets load', async () => {
    TestBed.resetTestingModule();
    store = configureGrammarTestBed([]);
    const element = await render();

    expect(radios(element)).toHaveLength(0);
    expect(element.textContent).toContain('Language assets are still loading.');
  });
});
