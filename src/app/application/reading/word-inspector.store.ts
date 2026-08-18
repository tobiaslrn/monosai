import { Injectable, computed, inject, signal } from '@angular/core';
import type { DictionaryEntry, DictionaryMatchBasis } from '../../domain/language/dictionary';
import { DICTIONARY_RESULT_LIMIT } from '../../domain/language/dictionary';
import type { LanguageError } from '../../domain/language/language-error';
import type { StructuralBaselineEntry } from '../../domain/language/structural-baseline';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { Token } from '../../domain/reading/token';
import {
  presentStatus,
  type TokenStatusPresentation,
} from '../../domain/reading/token-presentation';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import { LANGUAGE_RUNTIME } from '../shared/language-tokens';
import { LanguageStore } from '../language/language.store';

/** What the bundled dictionary had to say about the selected word. */
export type DictionaryState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'looking-up' }
  | {
      readonly kind: 'found';
      readonly matchedBy: DictionaryMatchBasis;
      readonly entries: readonly DictionaryEntry[];
    }
  /** A normal, explicit outcome: the compact dictionary does not cover it. */
  | { readonly kind: 'not-found' }
  | { readonly kind: 'failed'; readonly error: LanguageError };

export interface InspectedWord {
  readonly token: Token;
  readonly sentence: Sentence;
  readonly status: TokenStatusAssignment | null;
}

/**
 * The pinned word inspector.
 *
 * Lookup is local and bounded: it queries the bundled dictionary in the language
 * worker and never reaches the network, so inspecting a word works offline and
 * costs nothing.
 */
@Injectable()
export class WordInspectorStore {
  private readonly runtime = inject(LANGUAGE_RUNTIME);
  private readonly language = inject(LanguageStore);

  private readonly selectedSignal = signal<InspectedWord | null>(null);
  private readonly dictionarySignal = signal<DictionaryState>({ kind: 'idle' });
  private lookupToken = 0;

  readonly selected = this.selectedSignal.asReadonly();
  readonly dictionary = this.dictionarySignal.asReadonly();
  readonly isOpen = computed(() => this.selectedSignal() !== null);

  /**
   * The shipped baseline keyed by the id a `structural-baseline` status records.
   * Built once from the loaded bundle rather than per inspection, because a word
   * can be opened repeatedly while reading.
   */
  private readonly baselineById = computed(
    () =>
      new Map<string, StructuralBaselineEntry>(
        this.language.structuralBaseline().map((entry) => [entry.id, entry]),
      ),
  );

  readonly presentation = computed<TokenStatusPresentation | null>(() => {
    const status = this.selectedSignal()?.status ?? null;
    if (status === null) {
      return null;
    }
    const validation = status.validation;
    const entry =
      validation.category === 'structural-baseline'
        ? (this.baselineById().get(validation.ruleId) ?? null)
        : null;
    return presentStatus(validation, entry);
  });

  async inspect(word: InspectedWord): Promise<void> {
    this.selectedSignal.set(word);
    this.dictionarySignal.set({ kind: 'looking-up' });

    // Only the newest lookup may write a result: clicking through several words
    // quickly must not let an earlier answer overwrite a later one.
    this.lookupToken += 1;
    const token = this.lookupToken;

    const result = await this.runtime.lookup({
      surface: word.token.surface,
      limit: DICTIONARY_RESULT_LIMIT,
      ...(word.token.lemma === undefined ? {} : { lemma: word.token.lemma }),
      ...(word.token.readingHiragana === undefined
        ? {}
        : { readingHiragana: word.token.readingHiragana }),
      ...(word.token.partOfSpeech === undefined ? {} : { partOfSpeech: word.token.partOfSpeech }),
    });

    if (token !== this.lookupToken) {
      return;
    }
    if (!result.ok) {
      this.dictionarySignal.set({ kind: 'failed', error: result.error });
      return;
    }
    this.dictionarySignal.set(
      result.value.entries.length === 0
        ? { kind: 'not-found' }
        : { kind: 'found', matchedBy: result.value.matchedBy, entries: result.value.entries },
    );
  }

  close(): void {
    this.lookupToken += 1;
    this.selectedSignal.set(null);
    this.dictionarySignal.set({ kind: 'idle' });
  }
}
