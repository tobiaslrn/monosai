import { ChangeDetectionStrategy, Component, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { LanguageStore, type LanguageStatus } from '../../application/language/language.store';
import {
  VocabularyAvailabilityStore,
  type VocabularyAvailabilityState,
} from '../../application/vocabulary/vocabulary-availability.store';
import type { GrammarPreset } from '../../domain/grammar/presets';
import { snapshotId } from '../../domain/shared/ids';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import type { VocabularySourceKind } from '../../domain/vocabulary/vocabulary-source';
import { LibraryStandingComponent } from './library-standing.component';

const NOW = new Date(2026, 7, 21, 12, 0, 0).getTime();

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
  imports: [LibraryStandingComponent],
  template: `<mn-library-standing />`,
})
class HostComponent {}

function snapshotOf(
  uniqueEntryCount: number,
  sourceKinds: readonly VocabularySourceKind[] = ['anki-connect'],
  createdAt = NOW,
): VocabularySnapshot {
  return {
    id: snapshotId('snapshot-1'),
    revision: 'revision-1',
    createdAt,
    status: 'complete',
    uniqueEntryCount,
    sourceIds: [],
    sourceKinds,
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

describe('LibraryStandingComponent', () => {
  let state: WritableSignal<VocabularyAvailabilityState>;
  let preset: WritableSignal<GrammarPreset | null>;
  let profileLoaded: WritableSignal<boolean>;
  let languageStatus: WritableSignal<LanguageStatus>;

  beforeEach(() => {
    state = signal<VocabularyAvailabilityState>({ kind: 'unknown' });
    preset = signal<GrammarPreset | null>(PRESET);
    profileLoaded = signal(true);
    languageStatus = signal<LanguageStatus>('ready');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: VocabularyAvailabilityStore,
          useValue: { state, refresh: () => Promise.resolve() },
        },
        {
          provide: GrammarProfileStore,
          useValue: {
            selectedPreset: preset,
            loaded: profileLoaded,
            lastError: signal(null),
            load: () => Promise.resolve(),
          },
        },
        {
          provide: LanguageStore,
          useValue: { status: languageStatus, initialize: () => Promise.resolve(true) },
        },
      ],
    });
  });

  function render(): ComponentFixture<HostComponent> {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function lines(fixture: ComponentFixture<HostComponent>): {
    headline: string;
    detail: string;
    height: string;
  } {
    const element = fixture.nativeElement as HTMLElement;
    const standing = element.querySelector<HTMLElement>('[data-testid="library-standing"]');
    return {
      headline: (standing?.querySelector('.headline')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
      detail: standing?.querySelector('.detail')?.textContent.trim() ?? '',
      height: standing === null ? '' : getComputedStyle(standing).minHeight,
    };
  }

  /**
   * Two clauses, so neither fact qualifies the other: the count is measured
   * and the level is chosen.
   */
  it('names what the learner knows and what they read', () => {
    state.set({ kind: 'known', availability: 'ready', snapshot: snapshotOf(340) });

    expect(lines(render())).toMatchObject({
      headline: 'You know 340 words and read starter forms.',
      detail: '',
    });
  });

  /** The sync line is gone: it said nothing on the day the learner synced. */
  it('says nothing more once there are words to read', () => {
    state.set({ kind: 'known', availability: 'ready', snapshot: snapshotOf(12) });

    expect(lines(render())).toMatchObject({
      headline: 'You know 12 words and read starter forms.',
      detail: '',
    });
  });

  it('distinguishes a connected source with nothing in it from no source at all', () => {
    state.set({ kind: 'known', availability: 'empty', snapshot: snapshotOf(0) });
    expect(lines(render())).toMatchObject({
      headline: 'No words yet.',
      detail: 'A source is connected but has no words in it yet.',
    });

    state.set({ kind: 'known', availability: 'none', snapshot: null });
    const fixture = render();
    expect(lines(fixture).detail).toContain('Connect Anki to write stories');
  });

  /** A read that failed is not "you have no words". */
  it('says what could not be read without read-only boilerplate', () => {
    state.set({ kind: 'unavailable', message: 'The database could not be opened.' });

    expect(lines(render())).toMatchObject({
      headline: 'Your words could not be read.',
      detail: '',
    });
  });

  it('holds its two lines of space while the read has not answered', () => {
    const measured = lines(render());

    expect(measured.headline).toBe('');
    expect(measured.detail).toBe('');
    // The sentence's own four lines, in a unit that follows the reader's font.
    expect(measured.height).toBe('166.4px');
  });

  /**
   * The sentence is written once. Saying the count and adding the level a few
   * seconds later rewrote the line under the learner, so it waits instead.
   */
  it('holds the sentence back until the level it names has been read', () => {
    languageStatus.set('initializing');
    preset.set(null);
    state.set({ kind: 'known', availability: 'ready', snapshot: snapshotOf(340) });

    expect(lines(render()).headline).toBe('');
  });

  /** A level that cannot be read is dropped; the sentence still reads as one. */
  it('states the count alone once the level is known not to be coming', () => {
    languageStatus.set('failed');
    preset.set(null);
    state.set({ kind: 'known', availability: 'ready', snapshot: snapshotOf(340) });

    expect(lines(render())).toMatchObject({
      headline: 'You know 340 words.',
      detail: '',
    });
  });

  /** Four clauses, four lines, so the break never lands inside one of them. */
  it('sets the sentence as one line per clause', () => {
    state.set({ kind: 'known', availability: 'ready', snapshot: snapshotOf(340) });
    const element = render().nativeElement as HTMLElement;

    const clauses = [...element.querySelectorAll('.headline .line')].map((line) =>
      line.textContent.trim(),
    );
    expect(clauses).toEqual(['You know', '340 words', 'and read', 'starter forms.']);
  });

  it('keeps the hero copy free of navigation chrome', () => {
    state.set({ kind: 'known', availability: 'ready', snapshot: snapshotOf(340) });
    const element = render().nativeElement as HTMLElement;

    expect(element.querySelector('.headline mn-icon')).toBeNull();
  });

  it('is one link to the page that explains it', () => {
    state.set({ kind: 'known', availability: 'ready', snapshot: snapshotOf(340) });
    const element = render().nativeElement as HTMLElement;

    const link = element.querySelector<HTMLAnchorElement>('[data-testid="library-standing"]');
    expect(link?.tagName).toBe('A');
    expect(link?.getAttribute('href')).toContain('/reading-level#words');
  });
});
