import { ChangeDetectionStrategy, Component, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import {
  VocabularyAvailabilityStore,
  type VocabularyAvailabilityState,
} from '../../application/vocabulary/vocabulary-availability.store';
import type { GrammarPreset } from '../../domain/grammar/presets';
import { snapshotId } from '../../domain/shared/ids';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import { ReadingLevelRowComponent } from './reading-level-row.component';

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
  imports: [ReadingLevelRowComponent],
  template: `<mn-reading-level-row />`,
})
class HostComponent {}

function snapshotOf(uniqueEntryCount: number): VocabularySnapshot {
  return {
    id: snapshotId('snapshot-1'),
    createdAt: 1_700_000_000_000,
    status: 'complete',
    uniqueEntryCount,
    sourceIds: [],
    sourceKinds: ['anki-connect'],
    analyzerVersion: '1',
    normalizationVersion: '1',
    stats: {
      sourcesQueried: 1,
      entriesRead: uniqueEntryCount,
      nonEmptyValues: uniqueEntryCount,
      rejectedEmptyValues: 0,
      duplicateOccurrences: 0,
      uniqueExpressions: uniqueEntryCount,
      sourceWarnings: [],
    },
  };
}

describe('ReadingLevelRowComponent', () => {
  let state: WritableSignal<VocabularyAvailabilityState>;
  let preset: WritableSignal<GrammarPreset | null>;

  beforeEach(() => {
    state = signal<VocabularyAvailabilityState>({ kind: 'unknown' });
    preset = signal<GrammarPreset | null>(PRESET);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: VocabularyAvailabilityStore,
          useValue: { state, refresh: () => Promise.resolve() },
        },
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

  function row(element: HTMLElement): HTMLAnchorElement | null {
    return element.querySelector<HTMLAnchorElement>('[data-testid="settings-reading-level"]');
  }

  /** A signpost, not a panel: Settings points at the page, it does not hold it. */
  it('names the destination and leads to it', () => {
    const element = render();

    expect(row(element)?.getAttribute('href')).toBe('/reading-level');
    expect(row(element)?.textContent).toContain('What you can read');
  });

  it('states the current standing in one line', () => {
    state.set({ kind: 'known', availability: 'ready', snapshot: snapshotOf(340) });

    expect(row(render())?.textContent.replaceAll(/\s+/g, ' ')).toContain(
      '340 words · Starter forms',
    );
  });

  it('distinguishes no words from a read that failed', () => {
    state.set({ kind: 'known', availability: 'none', snapshot: null });
    expect(row(render())?.textContent).toContain('No words yet');

    state.set({ kind: 'unavailable', message: 'The database could not be opened.' });
    expect(row(render())?.textContent).toContain('Your words could not be read');
  });

  /** Nothing half-said while the read is in flight. */
  it('says only what it knows before the read answers', () => {
    const text = row(render())?.textContent.replaceAll(/\s+/g, ' ').trim();

    expect(text).toContain('What you can read');
    expect(text).toContain('Starter forms');
    expect(text).not.toContain('·');
  });
});
