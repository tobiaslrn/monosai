import { signal, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GrammarProfileStore } from '../app/application/grammar/grammar-profile.store';
import { LanguageStore } from '../app/application/language/language.store';
import type { GrammarRepository } from '../app/domain/grammar/grammar-repository';
import type { GrammarPreset, RegisterGuidance } from '../app/domain/grammar/presets';
import {
  DEFAULT_GRAMMAR_PROFILE_SELECTION,
  type GrammarProfileSelection,
  type GrammarProfileSnapshot,
} from '../app/domain/grammar/profile';
import { fixedClock } from '../app/domain/shared/clock';
import type { Hasher } from '../app/domain/shared/hashing';
import { ok, type Result } from '../app/domain/shared/result';
import type { StorageError } from '../app/domain/storage/storage-error';
import { CLOCK, GRAMMAR_REPOSITORY, HASHER } from '../app/application/shared/repository-tokens';

/**
 * Providers shared by the grammar component specs.
 *
 * The components render whatever the real `GrammarProfileStore` holds, so the
 * store is real and only its two ports are stubbed. That keeps a selection
 * round-trip in these specs a genuine round-trip.
 */

export const TEST_REGISTER_GUIDANCE: RegisterGuidance = {
  spoken: 'Prefer everyday spoken register.',
  written: 'Prefer polite written register.',
  either: '',
};

export const TEST_PRESETS: readonly GrammarPreset[] = [
  {
    id: 'mn-preset-starter',
    order: 0,
    nameEn: 'Starter forms',
    captionEn: 'the first patterns in any course',
    descriptionEn: 'Single short sentences, one idea each.',
    exampleJa: '私は学生です。',
    exampleEn: 'I am a student.',
    promptGuidance: 'Write single short clauses.',
  },
  {
    id: 'mn-preset-basic',
    order: 1,
    nameEn: 'Basic forms',
    captionEn: 'usually taught around N5',
    descriptionEn: 'Short sentences that can join two ideas.',
    exampleJa: '朝ごはんを食べてから、学校へ行きました。',
    exampleEn: 'After eating breakfast, I went to school.',
    promptGuidance: 'Write short sentences that may join two clauses.',
  },
];

export class StubGrammarRepository implements GrammarRepository {
  private stored: GrammarProfileSelection = DEFAULT_GRAMMAR_PROFILE_SELECTION;
  private readonly captures = new Map<string, GrammarProfileSnapshot>();

  getSelection(): Promise<Result<GrammarProfileSelection, StorageError>> {
    return Promise.resolve(ok(this.stored));
  }

  setSelection(selection: GrammarProfileSelection): Promise<Result<void, StorageError>> {
    this.stored = selection;
    return Promise.resolve(ok(undefined));
  }

  captureProfile(
    snapshot: GrammarProfileSnapshot,
  ): Promise<Result<GrammarProfileSnapshot, StorageError>> {
    this.captures.set(snapshot.id, snapshot);
    return Promise.resolve(ok(snapshot));
  }

  getProfileCapture(id: string): Promise<Result<GrammarProfileSnapshot | null, StorageError>> {
    return Promise.resolve(ok(this.captures.get(id) ?? null));
  }
}

const HASH: Hasher = { algorithm: 'test', hashText: (text) => `h(${text})` };

/**
 * The grammar port, on its own.
 *
 * The reading-level page needs the real store over a stubbed repository while
 * the rest of its providers come from the vocabulary bed, so the port is
 * available without the language stub this file's own bed installs.
 */
export function provideStubGrammarRepository(): Provider {
  return { provide: GRAMMAR_REPOSITORY, useValue: new StubGrammarRepository() };
}

export function configureGrammarTestBed(
  presets: readonly GrammarPreset[] = TEST_PRESETS,
): GrammarProfileStore {
  TestBed.configureTestingModule({
    providers: [
      GrammarProfileStore,
      provideStubGrammarRepository(),
      {
        provide: LanguageStore,
        useValue: {
          grammarPresets: signal<readonly GrammarPreset[]>(presets),
          registerGuidance: signal<RegisterGuidance | null>(TEST_REGISTER_GUIDANCE),
          versions: signal({ structuralBaselineVersion: '1.0.0' }),
        },
      },
      { provide: HASHER, useValue: HASH },
      { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
    ],
  });
  return TestBed.inject(GrammarProfileStore);
}
