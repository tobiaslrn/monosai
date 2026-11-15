import { ChangeDetectionStrategy, Component, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import type { GrammarPreset } from '../../domain/grammar/presets';
import { GrammarRowComponent } from './grammar-row.component';

const PRESET: GrammarPreset = {
  id: 'mn-preset-starter',
  order: 0,
  nameEn: 'Starter forms',
  captionEn: 'the first patterns in any course',
  descriptionEn: 'Single short sentences, one idea each.',
  exampleJa: '私は学生です。',
  exampleEn: 'I am a student.',
  promptGuidance: 'Write single short clauses.',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GrammarRowComponent],
  template: `<mn-grammar-row />`,
})
class HostComponent {}

describe('GrammarRowComponent', () => {
  let preset: WritableSignal<GrammarPreset | null>;

  beforeEach(() => {
    preset = signal<GrammarPreset | null>(PRESET);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: GrammarProfileStore,
          useValue: { selectedPreset: preset, load: () => Promise.resolve() },
        },
      ],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('leads to the grammar page and states the reading level', () => {
    const element = render();

    expect(element.querySelector('[data-testid="settings-grammar"]')?.getAttribute('href')).toBe(
      '/grammar',
    );
    const text = element.querySelector('mn-settings-row')?.textContent.replaceAll(/\s+/g, ' ');
    expect(text).toContain('Grammar');
    expect(text).toContain('Starter forms');
  });

  /** Nothing half-said while the level is still loading. */
  it('names only the row before the level is known', () => {
    preset.set(null);

    expect(render().querySelector('mn-settings-row')?.textContent.trim()).toBe('Grammar');
  });
});
