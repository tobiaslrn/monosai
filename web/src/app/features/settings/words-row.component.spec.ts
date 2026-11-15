import { ChangeDetectionStrategy, Component, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  VocabularyAvailabilityStore,
  type VocabularyAvailabilityState,
} from '../../application/vocabulary/vocabulary-availability.store';
import { snapshotId } from '../../domain/shared/ids';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import { WordsRowComponent } from './words-row.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WordsRowComponent],
  template: `<mn-words-row />`,
})
class HostComponent {}

function snapshotOf(uniqueEntryCount: number): VocabularySnapshot {
  return {
    id: snapshotId('snapshot-1'),
    revision: 'revision-1',
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

describe('WordsRowComponent', () => {
  let state: WritableSignal<VocabularyAvailabilityState>;

  beforeEach(() => {
    state = signal<VocabularyAvailabilityState>({ kind: 'unknown' });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: VocabularyAvailabilityStore,
          useValue: { state, refresh: () => Promise.resolve() },
        },
      ],
    });
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function row(element: HTMLElement): string {
    return (
      element.querySelector('mn-settings-row')?.textContent.replaceAll(/\s+/g, ' ').trim() ?? ''
    );
  }

  /** A signpost, not a panel: Settings points at the page, it does not hold it. */
  it('names the destination and leads to it', () => {
    const element = render();

    expect(element.querySelector('[data-testid="settings-words"]')?.getAttribute('href')).toBe(
      '/words',
    );
    expect(row(element)).toBe('Words');
  });

  it('states how many words there are', () => {
    state.set({ kind: 'known', availability: 'ready', snapshot: snapshotOf(340) });

    expect(row(render())).toContain('340 words');
  });

  it('distinguishes no words from a read that failed', () => {
    state.set({ kind: 'known', availability: 'none', snapshot: null });
    expect(row(render())).toContain('No words yet');

    state.set({ kind: 'unavailable', message: 'The database could not be opened.' });
    expect(row(render())).toContain('Your words could not be read');
  });
});
