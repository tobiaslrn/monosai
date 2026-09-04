import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GrammarProfileStore } from '../app/application/grammar/grammar-profile.store';
import { LanguageStore, type LanguageStatus } from '../app/application/language/language.store';
import type { StructuralBaselineEntry } from '../app/domain/language/structural-baseline';
import { provideStubGrammarRepository, TEST_PRESETS } from './grammar-fakes';
import { configureVocabularyTestBed, type VocabularyTestBed } from './vocabulary-fakes';

/**
 * The merged reading-level page reads both halves of the learner profile, so
 * its spec needs both test beds. The vocabulary bed is the base because it owns
 * the repositories; the grammar port and a fuller language stub are layered on
 * top of it.
 */

/** Two categories, so a summary that counts them has something to count. */
export const TEST_BASELINE: readonly StructuralBaselineEntry[] = [
  {
    id: 'sb-particle-wa',
    category: 'particle',
    forms: ['は'],
    readings: ['は'],
    partsOfSpeech: ['particle'],
    nameEn: 'は (topic marker)',
    descriptionEn: 'Marks the topic of the sentence.',
    exampleJa: '私は学生です。',
  },
  {
    id: 'sb-copula-desu',
    category: 'copula',
    forms: ['です'],
    readings: ['です'],
    partsOfSpeech: ['auxiliary'],
    nameEn: 'です (polite copula)',
    descriptionEn: 'States that something is the case, politely.',
    exampleJa: '本です。',
  },
];

export interface ReadingLevelTestBed extends VocabularyTestBed {
  /** Drives the language bundle's four states, including the failure surface. */
  readonly languageStatus: WritableSignal<LanguageStatus>;
}

export function configureReadingLevelTestBed(): ReadingLevelTestBed {
  const vocabulary = configureVocabularyTestBed();
  const languageStatus = signal<LanguageStatus>('ready');

  TestBed.configureTestingModule({
    providers: [GrammarProfileStore, provideStubGrammarRepository()],
  });
  TestBed.overrideProvider(LanguageStore, {
    useValue: {
      initialize: () => Promise.resolve(true),
      status: languageStatus.asReadonly(),
      structuralBaseline: signal(TEST_BASELINE),
      grammarPresets: signal(TEST_PRESETS),
      registerGuidance: signal({ spoken: '', written: '', either: '' }),
      versions: signal({ structuralBaselineVersion: '1.0.0' }),
    },
  });

  // Nothing is injected here: the caller still has overrides to install, and
  // instantiating the module would close that door.
  return { ...vocabulary, languageStatus };
}
