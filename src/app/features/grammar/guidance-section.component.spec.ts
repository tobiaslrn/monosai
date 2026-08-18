import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import {
  configureGrammarTestBed,
  TEST_PRESETS,
  TEST_REGISTER_GUIDANCE,
} from '../../../testing/grammar-fakes';
import { GuidanceSectionComponent } from './guidance-section.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GuidanceSectionComponent],
  template: `<mn-guidance-section />`,
})
class HostComponent {}

const STARTER_GUIDANCE = TEST_PRESETS[0].promptGuidance;

describe('GuidanceSectionComponent', () => {
  let store: GrammarProfileStore;
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;

  beforeEach(async () => {
    store = configureGrammarTestBed();
    await store.load();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Settles the awaited repository write the click started, then re-renders. */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function button(label: string): HTMLButtonElement {
    const found = [...element().querySelectorAll('button')].find((candidate) =>
      candidate.textContent.includes(label),
    );
    if (!found) {
      throw new Error(`no button labelled ${label}`);
    }
    return found;
  }

  function registerRadios(): HTMLInputElement[] {
    return [...element().querySelectorAll<HTMLInputElement>('input[name="grammar-register"]')];
  }

  it('offers every register with the neutral one stored by default', () => {
    const radios = registerRadios();

    expect(radios.map((radio) => radio.value)).toEqual(['spoken', 'written', 'either']);
    expect(radios.filter((radio) => radio.checked).map((radio) => radio.value)).toEqual(['either']);
  });

  it('round-trips a register change and appends its line to the guidance shown', async () => {
    registerRadios()[1].click();
    await settle();

    expect(store.selection().registerPreference).toBe('written');
    expect(element().querySelector('.guidance')?.textContent.trim()).toBe(
      `${STARTER_GUIDANCE} ${TEST_REGISTER_GUIDANCE.written}`,
    );
  });

  it('shows the resolved preset prose until the learner forks it', () => {
    expect(element().querySelector('.guidance')?.textContent.trim()).toBe(STARTER_GUIDANCE);
    expect(element().querySelector('textarea')).toBeNull();
    expect(button('Use my own wording')).toBeTruthy();
  });

  it('seeds the editor with the preset prose rather than an empty box', async () => {
    button('Use my own wording').click();
    await settle();

    expect(element().querySelector('textarea')?.value).toBe(STARTER_GUIDANCE);
  });

  it('saves an edited fork and reports it as the learner own wording', async () => {
    button('Use my own wording').click();
    await settle();

    const textarea = element().querySelector('textarea');
    if (!textarea) {
      throw new Error('the editor did not open');
    }
    textarea.value = 'Only very short sentences.';
    textarea.dispatchEvent(new Event('input'));
    await settle();
    button('Save wording').click();
    await settle();

    expect(store.selection().customGuidance).toBe('Only very short sentences.');
    expect(element().querySelector('.guidance')?.textContent.trim()).toBe(
      'Only very short sentences.',
    );
    expect(element().textContent).toContain('You are using your own wording');
  });

  it('discards an edit on cancel without touching the stored profile', async () => {
    button('Use my own wording').click();
    await settle();

    const textarea = element().querySelector('textarea');
    if (!textarea) {
      throw new Error('the editor did not open');
    }
    textarea.value = 'Discarded.';
    textarea.dispatchEvent(new Event('input'));
    await settle();
    button('Cancel').click();
    await settle();

    expect(store.isCustomGuidance()).toBe(false);
    expect(element().querySelector('.guidance')?.textContent.trim()).toBe(STARTER_GUIDANCE);
  });

  it('restores the preset prose on reset', async () => {
    await store.setCustomGuidance('Only very short sentences.');
    await settle();
    expect(store.isCustomGuidance()).toBe(true);

    button('Reset to preset').click();
    await settle();

    expect(store.isCustomGuidance()).toBe(false);
    expect(element().querySelector('.guidance')?.textContent.trim()).toBe(STARTER_GUIDANCE);
    expect(element().textContent).not.toContain('You are using your own wording');
  });

  it('bounds the editor at the same length the domain enforces', async () => {
    button('Use my own wording').click();
    await settle();

    expect(element().querySelector('textarea')?.getAttribute('maxlength')).toBe('1000');
  });
});
