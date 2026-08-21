import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  DictionaryEntry,
  DictionaryMatchBasis,
  DictionaryQuery,
} from '../../domain/language/dictionary';
import { DICTIONARY_RESULT_LIMIT } from '../../domain/language/dictionary';
import type { LanguageError } from '../../domain/language/language-error';
import type { StructuralBaselineEntry } from '../../domain/language/structural-baseline';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { WordGroup } from '../../domain/reading/token-grouping';
import { deriveWord, type WordDerivation } from '../../domain/reading/word-derivation';
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
  /** The morpheme that was pressed, which status and grammar are keyed by. */
  readonly token: Token;
  /** The whole word it belongs to: what is shown and what is looked up. */
  readonly word: WordGroup;
  readonly sentence: Sentence;
  readonly status: TokenStatusAssignment | null;
}

/**
 * The concise answer a hover gives before anything is pinned.
 *
 * Deliberately less than the pinned card: a reading and one gloss is what a
 * learner needs to keep reading, and anything more would be a card that
 * follows the pointer around (`ux-ui-specification.md:154`).
 */
export interface WordPreview {
  readonly word: WordGroup;
  readonly glossEn: string | null;
}

/**
 * The dictionary query for a word.
 *
 * The whole word is the surface, and the head's lemma and part of speech are
 * what the entry is looked up under: querying an inflected stem on its own
 * found the wrong word entirely — the あり of あります matched 蟻, "ant".
 */
function queryFor(word: WordGroup, limit: number): DictionaryQuery {
  const head = word.head;
  return {
    surface: word.surface,
    limit,
    lemma: head.lemma ?? head.surface,
    ...(word.readingHiragana === undefined ? {} : { readingHiragana: word.readingHiragana }),
    ...(head.partOfSpeech === undefined ? {} : { partOfSpeech: head.partOfSpeech }),
  };
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
  private readonly previewSignal = signal<WordPreview | null>(null);
  private lookupToken = 0;
  private previewLookupToken = 0;

  readonly selected = this.selectedSignal.asReadonly();
  readonly dictionary = this.dictionarySignal.asReadonly();
  readonly preview = this.previewSignal.asReadonly();
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

  /**
   * How the open word was built from its dictionary form.
   *
   * `null` unless there is something to explain, which is what makes this a
   * section that appears only when the word was inflected or added to.
   */
  readonly derivation = computed<WordDerivation | null>(() => {
    const word = this.selectedSignal()?.word;
    return word === undefined ? null : deriveWord(word, this.language.structuralBaselineMatcher());
  });

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

    const result = await this.runtime.lookup(queryFor(word.word, DICTIONARY_RESULT_LIMIT));

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

  /**
   * Looks up the one gloss a hover preview shows.
   *
   * Kept apart from `inspect` rather than reusing it: hovering across a line of
   * text must not overwrite the word the learner deliberately pinned, and a
   * preview that never arrives is simply not shown.
   */
  async previewWord(word: WordGroup): Promise<void> {
    this.previewLookupToken += 1;
    const lookup = this.previewLookupToken;
    this.previewSignal.set({ word, glossEn: null });

    const result = await this.runtime.lookup(queryFor(word, 1));

    if (lookup !== this.previewLookupToken || !result.ok) {
      return;
    }
    const glosses = result.value.entries.at(0)?.senses.at(0)?.glossesEn ?? [];
    this.previewSignal.set({ word, glossEn: glosses.length === 0 ? null : glosses.join('; ') });
  }

  clearPreview(): void {
    this.previewLookupToken += 1;
    this.previewSignal.set(null);
  }

  close(): void {
    this.lookupToken += 1;
    this.selectedSignal.set(null);
    this.dictionarySignal.set({ kind: 'idle' });
  }
}
